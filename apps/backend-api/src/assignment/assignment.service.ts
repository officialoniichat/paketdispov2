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

    const [casesRows, shiftRows, locationRows] = await Promise.all([
      this.prisma.goodsReceiptCase.findMany({
        where: { status: POOL_STATUS },
        include: { storageLocation: true },
      }),
      this.prisma.shift.findMany({
        where: { date: { gte: new Date(start), lte: new Date(end) }, active: true },
      }),
      this.prisma.location.findMany({ where: { active: true } }),
    ]);

    const input: EngineInput = {
      date: day,
      cases: casesRows.map(toGoodsReceiptCase),
      shifts: shiftRows.map(toEmployeeShift),
      locations: locationRows.map(toLocationMaster),
    };

    const t0 = performance.now();
    const plan = assignWork(input);
    const durationMs = Math.round(performance.now() - t0);

    const seqByBundleId = new Map<string, BundlePickupSequence>(
      plan.pickupSequences.map((s) => [s.bundleId, s]),
    );

    let assignedCaseCount = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const bundle of plan.bundles) {
        assignedCaseCount += await this.persistBundle(
          tx,
          bundle,
          seqByBundleId.get(bundle.id),
          principal,
        );
      }
    });

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
