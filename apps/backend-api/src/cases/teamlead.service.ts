import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AssignmentStatus, type PriorityFlag } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CaseStatus, ZstExportRow } from '@paket/domain-types';
import { zstRowsToCsv } from '../modules/reporting/csv-export.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { LiveStatusService } from '../live/live.module.js';
import type { Principal } from '../auth/rbac.js';
import {
  type AddToBundleDto,
  type BundleMutationResultDto,
  type BundlePauseDto,
  type CancelDto,
  type ParkDto,
  type ZstExportResultDto,
  type PrioritizeDto,
  type ReorderBundleDto,
  type ResolveIssueDto,
  type TransitionResultDto,
  type WithdrawDto,
} from './cases.dto.js';

type PrismaTx = Prisma.TransactionClient;

/** Bundle statuses an employee work already passed; these block destructive overrides. */
const TERMINAL_BUNDLE_STATUSES: AssignmentStatus[] = ['completed', 'cancelled'];
/** Case statuses where an employee has begun work — withdrawing then is illegal (§7.1). */
const STARTED_CASE_STATUSES: CaseStatus[] = [
  'in_progress',
  'issue_open',
  'partially_completed',
  'completed',
  'zst_done',
];

/** True iff `candidate` contains exactly the same ids as `current` (any order). */
function isPermutation(current: string[], candidate: string[]): boolean {
  if (current.length !== candidate.length) return false;
  const a = [...current].sort();
  const b = [...candidate].sort();
  return a.every((id, i) => id === b[i]);
}

/**
 * Teamlead pool steering (§14.2 /api/teamlead/*). Teamlead sees the full
 * operational pool and may park, prioritise, and resolve/release issues.
 */
@Injectable()
export class TeamleadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly events: EventLogService,
    private readonly live: LiveStatusService,
  ) {}

  park(principal: Principal, caseId: string, dto: ParkDto): Promise<TransitionResultDto> {
    return this.transition(caseId, 'parked', 'case.parked', principal, { reason: dto.reason });
  }

  unpark(principal: Principal, caseId: string): Promise<TransitionResultDto> {
    return this.transition(caseId, 'ready', 'case.ready', principal);
  }

  /**
   * Storno — cancel a case (e.g. duplicate import, ERP correction). Moves it to
   * the terminal `cancelled` state (§7.1) with a reasoned `case.cancelled` audit
   * event. The state machine only permits this from non-started states
   * (needs_review/ready/parked/assigned) and rejects the rest, so a case an
   * employee already works on cannot be silently voided.
   */
  cancel(principal: Principal, caseId: string, dto: CancelDto): Promise<TransitionResultDto> {
    return this.transition(caseId, 'cancelled', 'case.cancelled', principal, { reason: dto.reason });
  }

  /**
   * Tagesabschluss / ZST-Export (§15.1) — the bridge that finally makes `zst_done`
   * reachable. Takes every case currently in `completed`, moves it to the terminal
   * `zst_done` with a `zst.exported` audit event, stamps `exportedAt` on its ZST
   * records, and returns the handover as an RFC 4180 CSV. Idempotent: a case
   * already `zst_done` is simply not in the `completed` set, so re-running exports
   * only what is newly finished.
   */
  async exportZst(principal: Principal): Promise<ZstExportResultDto> {
    const completed = await this.prisma.goodsReceiptCase.findMany({
      where: { status: 'completed' },
      select: { id: true, weBelegNo: true, bookingDate: true },
    });
    const now = new Date();
    const rows: ZstExportRow[] = [];
    for (const c of completed) {
      await this.transition(c.id, 'zst_done', 'zst.exported', principal);
      const records = await this.prisma.zstRecord.findMany({ where: { caseId: c.id } });
      for (const r of records) {
        if (!r.exportedAt) {
          await this.prisma.zstRecord.update({ where: { id: r.id }, data: { exportedAt: now } });
        }
        const processingMinutes = r.startedAt
          ? Math.max(0, Math.round((r.completedAt.getTime() - r.startedAt.getTime()) / 60_000))
          : 0;
        rows.push({
          zstId: r.id,
          caseId: c.id,
          weBelegNo: c.weBelegNo,
          employeeId: r.employeeId,
          bookingDate: c.bookingDate.toISOString().slice(0, 10),
          completedQuantity: r.completedQuantity,
          effortPoints: r.effortPoints,
          processingMinutes,
          source: r.source,
          completedAt: r.completedAt.toISOString(),
        });
      }
    }
    return {
      date: now.toISOString().slice(0, 10),
      exportedCount: completed.length,
      csv: zstRowsToCsv(rows),
    };
  }

  async prioritize(
    principal: Principal,
    caseId: string,
    dto: PrioritizeDto,
  ): Promise<TransitionResultDto> {
    const found = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true, version: true, priorityFlags: true },
    });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);

    const flags = new Set<PriorityFlag>(found.priorityFlags);
    flags.add('manual_teamlead_priority');

    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceiptCase.update({
        where: { id: caseId },
        data: { priorityFlags: [...flags], version: { increment: 1 } },
      });
      await this.events.append(
        {
          eventType: 'case.prioritized',
          entityType: 'GoodsReceiptCase',
          entityId: caseId,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: { reason: dto.reason },
        },
        tx,
      );
    });

    return { caseId, status: found.status, version: found.version + 1, eventId: null };
  }

  /**
   * Resolve an issue and release the case back into work in one step: marks the
   * Issue `resolved` (with resolution + releasedBy/releasedAt) and transitions the
   * case `issue_open → in_progress` via an `issue.resolved` audit event.
   */
  async resolveIssue(
    principal: Principal,
    issueId: string,
    dto: ResolveIssueDto,
  ): Promise<TransitionResultDto> {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, caseId: true },
    });
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    return this.prisma.$transaction(async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        data: {
          status: 'resolved',
          resolution: dto.resolution,
          releasedBy: principal.sub,
          releasedAt: new Date(),
        },
      });
      const result = await this.workflow.transition({
        caseId: issue.caseId,
        toStatus: 'in_progress',
        eventType: 'issue.resolved',
        actor: { actorType: 'teamlead', actorId: principal.sub },
        payload: { issueId },
      });
      return this.toResult(result);
    });
  }

  // --- §8.4 manual bundle overrides ----------------------------------------

  /**
   * §8.4 Withdraw a case from a bundle: case → ready, unlink, drop its item,
   * re-sequence the remaining items + route stops, recompute the bundle effort.
   * §7.1 guard: only a case still in `assigned` may be pulled — once an employee
   * has started (in_progress/.../completed) it stays put (409 Conflict).
   */
  async withdraw(
    principal: Principal,
    bundleId: string,
    dto: WithdrawDto,
  ): Promise<BundleMutationResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await this.loadBundle(tx, bundleId);
      const item = bundle.items.find((i) => i.caseId === dto.caseId);
      if (!item) {
        throw new NotFoundException(`Case ${dto.caseId} is not in bundle ${bundleId}`);
      }
      const theCase = await tx.goodsReceiptCase.findUniqueOrThrow({
        where: { id: dto.caseId },
        select: { id: true, status: true, version: true },
      });
      if (STARTED_CASE_STATUSES.includes(theCase.status as CaseStatus)) {
        throw new ConflictException(
          `Case ${dto.caseId} is already in progress (${theCase.status}) and cannot be withdrawn`,
        );
      }
      if (theCase.status !== 'assigned') {
        throw new ConflictException(
          `Only an assigned case can be withdrawn (case is ${theCase.status})`,
        );
      }

      await tx.assignmentItem.delete({ where: { id: item.id } });
      await tx.goodsReceiptCase.update({
        where: { id: dto.caseId },
        data: { status: 'ready', assignedBundleId: null, version: { increment: 1 } },
      });

      const remaining = bundle.items.filter((i) => i.caseId !== dto.caseId).map((i) => i.caseId);
      await this.resequenceItems(tx, bundleId, remaining);
      await this.resequenceRouteStops(tx, bundleId, remaining);
      const plannedEffortMinutes = await this.recomputeEffort(tx, remaining);
      await tx.assignmentBundle.update({
        where: { id: bundleId },
        data: { plannedEffortMinutes },
      });

      const eventId = await this.auditOverride(tx, principal, bundleId, 'withdraw', dto.reason, {
        caseId: dto.caseId,
      });
      return {
        bundleId,
        bundleStatus: bundle.status,
        plannedEffortMinutes,
        caseIds: remaining,
        caseId: dto.caseId,
        caseStatus: 'ready',
        eventId,
      };
    });
  }

  /**
   * §8.4 Add a `ready` case to a bundle: case → assigned, link to the bundle,
   * append an item at the tail, recompute effort. Guard: the case must be
   * `ready` and the bundle must be active/assignable (not completed/cancelled).
   */
  async addToBundle(
    principal: Principal,
    bundleId: string,
    dto: AddToBundleDto,
  ): Promise<BundleMutationResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await this.loadBundle(tx, bundleId);
      if (TERMINAL_BUNDLE_STATUSES.includes(bundle.status)) {
        throw new ConflictException(`Bundle ${bundleId} is ${bundle.status} and cannot take cases`);
      }
      const theCase = await tx.goodsReceiptCase.findUnique({
        where: { id: dto.caseId },
        select: { id: true, status: true },
      });
      if (!theCase) throw new NotFoundException(`Case ${dto.caseId} not found`);
      if (theCase.status !== 'ready') {
        throw new ConflictException(
          `Only a ready case can be added (case is ${theCase.status})`,
        );
      }

      const nextSeq = bundle.items.length;
      await tx.assignmentItem.create({
        data: { bundleId, caseId: dto.caseId, sequence: nextSeq },
      });
      await tx.goodsReceiptCase.update({
        where: { id: dto.caseId },
        data: { status: 'assigned', assignedBundleId: bundleId, version: { increment: 1 } },
      });

      const caseIds = [...bundle.items.map((i) => i.caseId), dto.caseId];
      const plannedEffortMinutes = await this.recomputeEffort(tx, caseIds);
      await tx.assignmentBundle.update({
        where: { id: bundleId },
        data: { plannedEffortMinutes },
      });

      const eventId = await this.auditOverride(tx, principal, bundleId, 'add', dto.reason, {
        caseId: dto.caseId,
      });
      return {
        bundleId,
        bundleStatus: bundle.status,
        plannedEffortMinutes,
        caseIds,
        caseId: dto.caseId,
        caseStatus: 'assigned',
        eventId,
      };
    });
  }

  /**
   * §8.4 Reorder the bundle's items to match `caseIds`. The payload must be an
   * exact permutation of the bundle's current case ids (else 400). Route stops
   * follow: each stop is resequenced by the earliest position of any of its
   * cases in the new order.
   */
  async reorder(
    principal: Principal,
    bundleId: string,
    dto: ReorderBundleDto,
  ): Promise<BundleMutationResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await this.loadBundle(tx, bundleId);
      const current = bundle.items.map((i) => i.caseId);
      if (!isPermutation(current, dto.caseIds)) {
        throw new BadRequestException(
          `caseIds must be a permutation of the bundle's current cases`,
        );
      }

      await this.resequenceItems(tx, bundleId, dto.caseIds);
      await this.resequenceRouteStops(tx, bundleId, dto.caseIds);

      const eventId = await this.auditOverride(tx, principal, bundleId, 'reorder', dto.reason, {
        caseIds: dto.caseIds,
      });
      return {
        bundleId,
        bundleStatus: bundle.status,
        plannedEffortMinutes: bundle.plannedEffortMinutes,
        caseIds: dto.caseIds,
        caseId: null,
        caseStatus: null,
        eventId,
      };
    });
  }

  /** §8.4 Pause a bundle (→ paused). Blocked once completed/cancelled. */
  pauseBundle(
    principal: Principal,
    bundleId: string,
    dto: BundlePauseDto,
  ): Promise<BundleMutationResultDto> {
    return this.setBundleStatus(principal, bundleId, 'paused', 'pause', dto.reason);
  }

  /**
   * §8.4 Resume a paused bundle. Restores the engine's active value `assigned`
   * (recalculate persists bundles as `assigned`, and the board maps
   * `paused = status === 'paused'`), so pause → resume round-trips cleanly back to
   * the same not-paused state the plan started in. Blocked once completed/cancelled.
   */
  resumeBundle(
    principal: Principal,
    bundleId: string,
    dto: BundlePauseDto,
  ): Promise<BundleMutationResultDto> {
    return this.setBundleStatus(principal, bundleId, 'assigned', 'resume', dto.reason);
  }

  private setBundleStatus(
    principal: Principal,
    bundleId: string,
    toStatus: AssignmentStatus,
    action: string,
    reason?: string,
  ): Promise<BundleMutationResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await this.loadBundle(tx, bundleId);
      if (TERMINAL_BUNDLE_STATUSES.includes(bundle.status)) {
        throw new ConflictException(
          `Bundle ${bundleId} is ${bundle.status} and cannot be ${action}d`,
        );
      }
      await tx.assignmentBundle.update({ where: { id: bundleId }, data: { status: toStatus } });
      const eventId = await this.auditOverride(tx, principal, bundleId, action, reason, {});
      return {
        bundleId,
        bundleStatus: toStatus,
        plannedEffortMinutes: bundle.plannedEffortMinutes,
        caseIds: bundle.items.map((i) => i.caseId),
        caseId: null,
        caseStatus: null,
        eventId,
      };
    });
  }

  private async loadBundle(
    tx: PrismaTx,
    bundleId: string,
  ): Promise<{
    id: string;
    status: AssignmentStatus;
    plannedEffortMinutes: number;
    items: { id: string; caseId: string; sequence: number }[];
  }> {
    const bundle = await tx.assignmentBundle.findUnique({
      where: { id: bundleId },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
    if (!bundle) throw new NotFoundException(`Bundle ${bundleId} not found`);
    return {
      id: bundle.id,
      status: bundle.status,
      plannedEffortMinutes: bundle.plannedEffortMinutes,
      items: bundle.items.map((i) => ({ id: i.id, caseId: i.caseId, sequence: i.sequence })),
    };
  }

  /** Rewrite AssignmentItem.sequence so it matches `orderedCaseIds`. */
  private async resequenceItems(
    tx: PrismaTx,
    bundleId: string,
    orderedCaseIds: string[],
  ): Promise<void> {
    for (let i = 0; i < orderedCaseIds.length; i++) {
      await tx.assignmentItem.updateMany({
        where: { bundleId, caseId: orderedCaseIds[i] },
        data: { sequence: i },
      });
    }
  }

  /**
   * Re-sequence route stops to follow the new case order: a stop's rank is the
   * earliest index (in `orderedCaseIds`) of any case it serves (via orderIds);
   * stops that touch no listed case keep their relative order at the tail.
   */
  private async resequenceRouteStops(
    tx: PrismaTx,
    bundleId: string,
    orderedCaseIds: string[],
  ): Promise<void> {
    const stops = await tx.routeStop.findMany({
      where: { bundleId },
      orderBy: { sequence: 'asc' },
    });
    if (stops.length === 0) return;
    const rankOf = new Map(orderedCaseIds.map((id, idx) => [id, idx]));
    const ranked = stops.map((s, originalIdx) => {
      const ranks = s.orderIds
        .map((id) => rankOf.get(id))
        .filter((r): r is number => r !== undefined);
      const primary = ranks.length > 0 ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
      return { id: s.id, primary, originalIdx };
    });
    ranked.sort((a, b) => a.primary - b.primary || a.originalIdx - b.originalIdx);
    // Two-phase write to avoid colliding with the @@unique([bundleId, sequence]):
    // first park every stop at a negative slot, then assign the final 0..n order.
    for (const [i, stop] of ranked.entries()) {
      await tx.routeStop.update({ where: { id: stop.id }, data: { sequence: -(i + 1) } });
    }
    for (const [i, stop] of ranked.entries()) {
      await tx.routeStop.update({ where: { id: stop.id }, data: { sequence: i } });
    }
  }

  /** Sum estimatedMinutes of the given cases — the bundle's planned effort. */
  private async recomputeEffort(tx: PrismaTx, caseIds: string[]): Promise<number> {
    if (caseIds.length === 0) return 0;
    const agg = await tx.goodsReceiptCase.aggregate({
      where: { id: { in: caseIds } },
      _sum: { estimatedMinutes: true },
    });
    return agg._sum.estimatedMinutes ?? 0;
  }

  /** Append the §8.4 audit event (actorType=teamlead, action+reason in payload). */
  private async auditOverride(
    tx: PrismaTx,
    principal: Principal,
    bundleId: string,
    action: string,
    reason: string | undefined,
    extra: Record<string, unknown>,
  ): Promise<string> {
    const ev = await this.events.append(
      {
        eventType: 'assignment.overridden',
        entityType: 'AssignmentBundle',
        entityId: bundleId,
        actorType: 'teamlead',
        actorId: principal.sub,
        payload: { action, reason: reason ?? null, ...extra },
      },
      tx,
    );
    return ev.id;
  }

  private async transition(
    caseId: string,
    toStatus: Parameters<WorkflowService['transition']>[0]['toStatus'],
    eventType: Parameters<WorkflowService['transition']>[0]['eventType'],
    principal: Principal,
    payload?: unknown,
  ): Promise<TransitionResultDto> {
    const result = await this.workflow.transition({
      caseId,
      toStatus,
      eventType,
      actor: { actorType: 'teamlead', actorId: principal.sub },
      payload,
    });
    return this.toResult(result);
  }

  private toResult(result: {
    caseId: string;
    status: string;
    version: number;
    event: { id: string } | null;
  }): TransitionResultDto {
    this.live.publish({
      caseId: result.caseId,
      status: result.status,
      employeeNo: null,
      at: new Date().toISOString(),
    });
    return {
      caseId: result.caseId,
      status: result.status,
      version: result.version,
      eventId: result.event?.id ?? null,
    };
  }
}
