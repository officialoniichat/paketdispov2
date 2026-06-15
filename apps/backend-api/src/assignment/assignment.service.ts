import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assignWork, type EngineInput } from '@paket/assignment-engine';
import type { AssignmentBundle, BundlePickupSequence } from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';

type PrismaTx = Prisma.TransactionClient;
import { EventLogService } from '../events/event-log.service.js';
import type { Principal } from '../auth/rbac.js';
import { toEmployeeShift, toGoodsReceiptCase, toLocationMaster } from './assignment.mappers.js';
import type { RecalculateResultDto } from './assignment.dto.js';

const POOL_STATUS = 'ready' as const;

/**
 * Assignment engine wiring (§8.3, Anhang E.5). Reads the ready pool + the day's
 * shifts + location master, runs the pure deterministic engine, and persists the
 * resulting bundles/route-stops transactionally with audit events. Teamlead
 * "Neu berechnen" calls this; it stays well under the < 5 s budget.
 */
@Injectable()
export class AssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventLogService,
  ) {}

  async recalculate(principal: Principal, date?: string): Promise<RecalculateResultDto> {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const start = day + 'T00:00:00.000Z';
    const end = day + 'T23:59:59.999Z';
    const dayStart = new Date(start);
    const dayEnd = new Date(end);

    const [shiftRows, locationRows] = await Promise.all([
      this.prisma.shift.findMany({
        where: { date: { gte: dayStart, lte: dayEnd }, active: true },
      }),
      this.prisma.location.findMany({ where: { active: true } }),
    ]);

    let durationMs = 0;
    let plan: ReturnType<typeof assignWork> | undefined;
    let assignedCaseCount = 0;

    // ONE transaction: clearing the prior plan, re-reading the freed pool, running
    // the engine, and persisting the new plan all commit (or roll back) together so
    // a failure leaves the previous plan intact (§8.3 "Neu berechnen" must be re-runnable).
    await this.prisma.$transaction(async (tx) => {
      // 1. Clear the prior plan for this date so the re-insert is clean and idempotent.
      //    Only revert cases that a PRIOR recalc left in `assigned` — cases an employee
      //    has already started/completed (picking/checking/.../completed) are left alone.
      await this.clearPriorPlanForDate(tx, dayStart, dayEnd);

      // 2. Re-read the now-freed `ready` pool inside the transaction (reverted cases
      //    are back in the pool, in-flight cases are excluded by their status).
      const casesRows = await tx.goodsReceiptCase.findMany({
        where: { status: POOL_STATUS },
        include: { storageLocation: true },
      });

      const input: EngineInput = {
        date: day,
        cases: casesRows.map(toGoodsReceiptCase),
        shifts: shiftRows.map(toEmployeeShift),
        locations: locationRows.map(toLocationMaster),
      };

      const t0 = performance.now();
      plan = assignWork(input);
      durationMs = Math.round(performance.now() - t0);

      const seqByBundleId = new Map<string, BundlePickupSequence>(
        plan.pickupSequences.map((s) => [s.bundleId, s]),
      );

      for (const bundle of plan.bundles) {
        assignedCaseCount += await this.persistBundle(
          tx,
          bundle,
          seqByBundleId.get(bundle.id),
          principal,
        );
      }
    });

    const finalPlan = plan as ReturnType<typeof assignWork>;
    return {
      date: day,
      bundleCount: finalPlan.bundles.length,
      assignedCaseCount,
      unassignedCaseCount: finalPlan.unassigned.length,
      reserveMinutes: finalPlan.reserve.minutes,
      durationMs,
      loads: finalPlan.loads.map((l) => ({
        employeeId: l.employeeId,
        capacityMinutes: l.capacityMinutes,
        assignedMinutes: l.assignedMinutes,
        assignedPoints: l.assignedPoints,
        bundleCount: l.bundleCount,
      })),
    };
  }

  /**
   * Remove the prior assignment plan for `date` so recalculate can re-insert cleanly.
   * FK-safe order: items → route stops → cases reset → bundles. The §7.2 audit log
   * (WorkflowEvent) is append-only and is intentionally NOT touched here.
   *
   * Only cases still in `assigned` (i.e. a prior recalc placed them but no employee
   * has begun work) are reverted to `ready` and unlinked. Cases an employee has
   * already started or finished (picking/preparing/.../completed) keep their bundle
   * link — their bundles are skipped from deletion so the FK on assignedBundleId holds.
   */
  private async clearPriorPlanForDate(tx: PrismaTx, dayStart: Date, dayEnd: Date): Promise<void> {
    const priorBundles = await tx.assignmentBundle.findMany({
      where: { date: { gte: dayStart, lte: dayEnd } },
      select: { id: true },
    });
    if (priorBundles.length === 0) return;
    const bundleIds = priorBundles.map((b) => b.id);

    // Cases this prior recalc placed but nobody has started yet (status `assigned`).
    // These are reverted to the ready pool; their AssignmentItems must be dropped so
    // the @@unique([caseId]) constraint stays free when the engine re-bundles them.
    const revertable = await tx.goodsReceiptCase.findMany({
      where: { assignedBundleId: { in: bundleIds }, status: 'assigned' },
      select: { id: true },
    });
    const revertCaseIds = revertable.map((c) => c.id);

    if (revertCaseIds.length > 0) {
      // Drop stale items for reverted cases first (even if their bundle survives
      // because a sibling case is in-flight) — otherwise re-bundling hits P2002.
      await tx.assignmentItem.deleteMany({ where: { caseId: { in: revertCaseIds } } });
      await tx.goodsReceiptCase.updateMany({
        where: { id: { in: revertCaseIds } },
        data: { assignedBundleId: null, status: POOL_STATUS, version: { increment: 1 } },
      });
    }

    // Bundles that still own an in-flight/completed case (status not `assigned`) must
    // survive so the FK on GoodsReceiptCase.assignedBundleId holds.
    const stillReferenced = await tx.goodsReceiptCase.findMany({
      where: { assignedBundleId: { in: bundleIds } },
      select: { assignedBundleId: true },
    });
    const keepBundleIds = new Set(
      stillReferenced.map((c) => c.assignedBundleId).filter((id): id is string => id !== null),
    );
    const deletableBundleIds = bundleIds.filter((id) => !keepBundleIds.has(id));
    if (deletableBundleIds.length === 0) return;

    // FK-safe delete order: children (items + route stops) then the bundle itself.
    await tx.assignmentItem.deleteMany({ where: { bundleId: { in: deletableBundleIds } } });
    await tx.routeStop.deleteMany({ where: { bundleId: { in: deletableBundleIds } } });
    await tx.assignmentBundle.deleteMany({ where: { id: { in: deletableBundleIds } } });
  }

  /** Persist one engine bundle (bundle + items + route stops + case links + events). */
  private async persistBundle(
    tx: PrismaTx,
    bundle: AssignmentBundle,
    sequence: BundlePickupSequence | undefined,
    principal: Principal,
  ): Promise<number> {
    const created = await tx.assignmentBundle.create({
      data: {
        employeeId: bundle.employeeId,
        date: new Date(bundle.date),
        plannedEffortMinutes: bundle.plannedEffortMinutes,
        effortPoints: bundle.effortPoints,
        status: 'assigned',
        createdBy: bundle.createdBy === 'teamlead' ? 'teamlead' : 'system',
      },
    });

    await Promise.all(
      bundle.caseIds.map((caseId, index) =>
        tx.assignmentItem.create({ data: { bundleId: created.id, caseId, sequence: index } }),
      ),
    );

    const stops = sequence?.stops ?? bundle.route;
    await Promise.all(
      stops.map((stop) =>
        tx.routeStop.create({
          data: {
            bundleId: created.id,
            sequence: stop.sequence,
            locationId: stop.locationId,
            locationCode: stop.locationCode,
            orderIds: stop.orderIds,
            scanRequired: stop.scanRequired,
            skipAllowedWithReason: stop.skipAllowedWithReason,
          },
        }),
      ),
    );

    // Link cases to the bundle and move ready → assigned (§7.1) under optimistic lock.
    await tx.goodsReceiptCase.updateMany({
      where: { id: { in: bundle.caseIds }, status: POOL_STATUS },
      data: { assignedBundleId: created.id, status: 'assigned', version: { increment: 1 } },
    });

    await this.events.append(
      {
        eventType: 'bundle.created',
        entityType: 'AssignmentBundle',
        entityId: created.id,
        actorType: 'system',
        actorId: principal.sub,
        payload: { caseIds: bundle.caseIds, effortPoints: bundle.effortPoints },
      },
      tx,
    );
    await this.events.append(
      {
        eventType: 'bundle.assigned',
        entityType: 'AssignmentBundle',
        entityId: created.id,
        actorType: 'teamlead',
        actorId: principal.sub,
        payload: { employeeId: bundle.employeeId, caseCount: bundle.caseIds.length },
      },
      tx,
    );

    return bundle.caseIds.length;
  }
}
