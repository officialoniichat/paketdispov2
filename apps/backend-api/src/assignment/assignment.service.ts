import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assignWork, type EngineInput } from '@paket/assignment-engine';
import {
  weeklyPatternSchema,
  type AssignmentBundle,
  type BundlePickupSequence,
  type WeeklyPattern,
} from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';

type PrismaTx = Prisma.TransactionClient;
import { EventLogService } from '../events/event-log.service.js';
import type { Principal } from '../auth/rbac.js';
import { toEmployeeShift, toGoodsReceiptCase, toLocationMaster } from './assignment.mappers.js';
import type { RecalculateResultDto } from './assignment.dto.js';

const POOL_STATUS = 'ready' as const;

/**
 * Read set for the §E.4 Simulation/Vorschau. Unlike recalculate (which only plans
 * the freed `ready` pool), preview also re-includes cases already placed in today's
 * plan but not yet started (`assigned`). After a commit the `ready` pool is empty, so
 * a `ready`-only preview would return an empty proposal; including `assigned` lets
 * "Simulieren" meaningfully re-propose today's plan. Cases an employee has begun
 * (picking/.../completed) are intentionally excluded — they are no longer re-planable.
 */
const PREVIEW_POOL_STATUSES = ['ready', 'assigned'] as const;

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

    // Ensure each active employee's concrete shift for the day exists, derived from
    // their weekly pattern (Wochenplan drives capacity). This makes recalculate work
    // for ANY day — not just a pre-seeded one — so the board is never empty just
    // because the calendar rolled over to a new (un-materialized) date.
    await this.materializeShiftsForDate(day, dayStart);

    const [shiftRows, locationRows] = await Promise.all([
      this.prisma.shift.findMany({
        where: { date: { gte: dayStart, lte: dayEnd }, active: true },
        include: { employee: { select: { bereiche: true } } },
      }),
      this.prisma.location.findMany({ where: { active: true } }),
    ]);

    // ONE transaction: clearing the prior plan, re-reading the freed pool, running
    // the engine, and persisting the new plan all commit (or roll back) together so
    // a failure leaves the previous plan intact (§8.3 "Neu berechnen" must be re-runnable).
    // The callback returns the engine plan + metrics so we never need a post-tx cast.
    const { plan, durationMs, assignedCaseCount } = await this.prisma.$transaction(async (tx) => {
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
        shifts: shiftRows.map((s) => toEmployeeShift(s, s.employee.bereiche)),
        locations: locationRows.map(toLocationMaster),
      };

      const t0 = performance.now();
      const computedPlan = assignWork(input);
      const elapsedMs = Math.round(performance.now() - t0);

      const seqByBundleId = new Map<string, BundlePickupSequence>(
        computedPlan.pickupSequences.map((s) => [s.bundleId, s]),
      );

      let persistedCount = 0;
      for (const bundle of computedPlan.bundles) {
        persistedCount += await this.persistBundle(
          tx,
          bundle,
          seqByBundleId.get(bundle.id),
          principal,
        );
      }

      return { plan: computedPlan, durationMs: elapsedMs, assignedCaseCount: persistedCount };
    });

    return this.toResultDto(day, plan, assignedCaseCount, durationMs);
  }

  /**
   * Materialize each active employee's concrete Shift for `dayIso` from their weekly
   * pattern (Wochenplan → capacity). A non-working day drops any existing shift; a
   * working day upserts the derived netCapacity (source='pattern'). Idempotent.
   */
  private async materializeShiftsForDate(dayIso: string, dayDate: Date): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, productivityFactor: true, weeklyPattern: true },
    });
    const keys: (keyof WeeklyPattern)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const key = keys[dayDate.getUTCDay()]!;
    for (const u of users) {
      const parsed = weeklyPatternSchema.safeParse(u.weeklyPattern);
      const plan = parsed.success ? parsed.data[key] : undefined;
      if (!plan || !plan.working || !plan.start || !plan.end) {
        await this.prisma.shift.deleteMany({ where: { employeeId: u.id, date: dayDate } });
        continue;
      }
      const [sh, sm] = plan.start.split(':').map(Number);
      const [eh, em] = plan.end.split(':').map(Number);
      const startMin = (sh ?? 0) * 60 + (sm ?? 0);
      const endMin = (eh ?? 0) * 60 + (em ?? 0);
      const net = Math.round(
        Math.max(0, endMin - startMin - plan.breakMinutes) *
          u.productivityFactor *
          (plan.partTimePct / 100),
      );
      const data = {
        plannedStart: new Date(`${dayIso}T${plan.start}:00`),
        plannedEnd: new Date(`${dayIso}T${plan.end}:00`),
        breakMinutes: plan.breakMinutes,
        plannedHours: Math.round((Math.max(0, endMin - startMin) / 60) * 100) / 100,
        netCapacityMinutes: net,
        active: net > 0,
        source: 'pattern' as const,
        productivityFactor: u.productivityFactor,
      };
      await this.prisma.shift.upsert({
        where: { shift_employee_date: { employeeId: u.id, date: dayDate } },
        create: { employeeId: u.id, date: dayDate, ...data },
        update: data,
      });
    }
  }

  /**
   * §E.4 Simulation/Vorschau: run the SAME deterministic engine as recalculate()
   * over the current `ready` pool, but persist NOTHING — no bundle/item/route-stop
   * rows, no case status changes, no audit events. The teamlead reviews this
   * proposed plan before committing it via recalculate(). Reads are non-mutating,
   * so no transaction is needed; assignedCaseCount mirrors the would-be persist.
   */
  async preview(_principal: Principal, date?: string): Promise<RecalculateResultDto> {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const dayStart = new Date(day + 'T00:00:00.000Z');
    const dayEnd = new Date(day + 'T23:59:59.999Z');

    const [shiftRows, locationRows, casesRows] = await Promise.all([
      this.prisma.shift.findMany({
        where: { date: { gte: dayStart, lte: dayEnd }, active: true },
        include: { employee: { select: { bereiche: true } } },
      }),
      this.prisma.location.findMany({ where: { active: true } }),
      this.prisma.goodsReceiptCase.findMany({
        where: { status: { in: [...PREVIEW_POOL_STATUSES] } },
        include: { storageLocation: true },
      }),
    ]);

    // The engine's §8.1 eligibility is `ready`/`partially_completed`; an already
    // committed-but-not-started case is `assigned`. For the simulation we present
    // those `assigned` cases to the pure engine AS `ready` so it re-proposes today's
    // plan (recalculate is untouched — this normalisation is preview-only and never
    // persisted). Started/finished cases were already excluded by the read filter.
    const input: EngineInput = {
      date: day,
      cases: casesRows
        .map(toGoodsReceiptCase)
        .map((c) => (c.status === 'assigned' ? { ...c, status: 'ready' as const } : c)),
      shifts: shiftRows.map((s) => toEmployeeShift(s, s.employee.bereiche)),
      locations: locationRows.map(toLocationMaster),
    };

    const t0 = performance.now();
    const plan = assignWork(input);
    const durationMs = Math.round(performance.now() - t0);

    // Proposed assignment count = cases the engine placed into bundles (no DB write).
    const assignedCaseCount = plan.bundles.reduce((sum, b) => sum + b.caseIds.length, 0);
    return this.toResultDto(day, plan, assignedCaseCount, durationMs);
  }

  /** Shape an engine plan into the RecalculateResultDto returned by recalculate/preview. */
  private toResultDto(
    day: string,
    plan: ReturnType<typeof assignWork>,
    assignedCaseCount: number,
    durationMs: number,
  ): RecalculateResultDto {
    return {
      date: day,
      bundleCount: plan.bundles.length,
      assignedCaseCount,
      unassignedCaseCount: plan.unassigned.length,
      reserveMinutes: plan.reserve.minutes,
      durationMs,
      loads: plan.loads.map((l) => ({
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
    // The engine placing a bundle on an employee is a SYSTEM action (mirrors the
    // sibling `bundle.created`). It must NOT carry actorType `teamlead`, or the
    // "Letzte Teamlead-Eingriffe" feed (genuine human overrides) would be polluted
    // with every automatic assignment. Human overrides (§8.4 assignment.overridden,
    // case.prioritized/parked/ready) are the only teamlead-actor events.
    await this.events.append(
      {
        eventType: 'bundle.assigned',
        entityType: 'AssignmentBundle',
        entityId: created.id,
        actorType: 'system',
        actorId: principal.sub,
        payload: { employeeId: bundle.employeeId, caseCount: bundle.caseIds.length },
      },
      tx,
    );

    return bundle.caseIds.length;
  }
}
