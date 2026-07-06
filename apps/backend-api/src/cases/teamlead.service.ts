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
import { assertTransition } from '../workflow/case-state-machine.js';
import { EventLogService } from '../events/event-log.service.js';
import { LiveStatusService } from '../live/live.module.js';
import type { Principal } from '../auth/rbac.js';
import {
  type AddToBundleDto,
  type AssignToEmployeeDto,
  type BundleMutationResultDto,
  type BundlePauseDto,
  type CancelDto,
  type DeliveryGroupEditDto,
  type DeliveryGroupEditResultDto,
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

/**
 * UTC-midnight Date for an optional `YYYY-MM-DD` (or `now`'s day) — matches the
 * `@db.Date` / board day semantics used across the read service.
 */
function resolveDay(date: string | undefined, now: Date): Date {
  const ymd = date ?? now.toISOString().slice(0, 10);
  return new Date(`${ymd}T00:00:00.000Z`);
}

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

  /** „Zur Planung freigeben" — approve a reviewed case into the pool (needs_review → ready). */
  approve(principal: Principal, caseId: string, dto: ParkDto): Promise<TransitionResultDto> {
    return this.transition(caseId, 'ready', 'case.ready', principal, { reason: dto.reason });
  }

  /** „Rest reaktivieren" — put a part-finished case's remainder back to work (partially_completed → ready). */
  reactivate(principal: Principal, caseId: string, dto: ParkDto): Promise<TransitionResultDto> {
    return this.transition(caseId, 'ready', 'case.ready', principal, { reason: dto.reason });
  }

  /**
   * Storno — cancel a case (e.g. duplicate import, ERP correction). Moves it to
   * the terminal `cancelled` state (§7.1) with a reasoned `case.cancelled` audit
   * event. The state machine permits this from every non-terminal state incl.
   * mid-work (needs_review/ready/parked/assigned/in_progress/issue_open). In the
   * same transaction the case is detached from any bundle (assignedBundleId=null)
   * so a cancelled case never stays linked to a bundle.
   */
  async cancel(principal: Principal, caseId: string, dto: CancelDto): Promise<TransitionResultDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.goodsReceiptCase.findUnique({
        where: { id: caseId },
        select: { id: true, status: true, version: true },
      });
      if (!current) throw new NotFoundException(`Case ${caseId} not found`);
      assertTransition(current.status as CaseStatus, 'cancelled');

      const updated = await tx.goodsReceiptCase.updateMany({
        where: { id: current.id, version: current.version },
        data: { status: 'cancelled', assignedBundleId: null, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new ConflictException('Case was modified concurrently');
      }

      const event = await this.events.append(
        {
          eventType: 'case.cancelled',
          entityType: 'GoodsReceiptCase',
          entityId: current.id,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: { from: current.status, to: 'cancelled', reason: dto.reason },
        },
        tx,
      );

      return { caseId: current.id, status: 'cancelled', version: current.version + 1, event };
    });
    return this.toResult(result);
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
   * Teamlead-Korrektur „Lieferung" (Teamlead-Punkt 1): merge Belege into ONE locked
   * delivery group. Also serves „bestätigen" (promote a suspected group to locked). The
   * shared `grp:` key freezes them against auto re-detection.
   */
  async mergeDeliveryGroup(
    principal: Principal,
    dto: DeliveryGroupEditDto,
  ): Promise<DeliveryGroupEditResultDto> {
    const caseIds = [...new Set(dto.caseIds)];
    if (caseIds.length < 2) {
      throw new BadRequestException('Eine Lieferung braucht mindestens zwei Belege.');
    }
    const found = await this.prisma.goodsReceiptCase.findMany({
      where: { id: { in: caseIds } },
      select: { id: true },
    });
    if (found.length !== caseIds.length) {
      throw new NotFoundException('Mindestens ein Beleg wurde nicht gefunden.');
    }
    const manualGroupKey = `grp:${[...caseIds].sort()[0]}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceiptCase.updateMany({
        where: { id: { in: caseIds } },
        data: { manualDeliveryGroupKey: manualGroupKey, version: { increment: 1 } },
      });
      await this.events.append(
        {
          eventType: 'case.delivery_group_merged',
          entityType: 'GoodsReceiptCase',
          entityId: caseIds[0]!,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: { caseIds, manualGroupKey, reason: dto.reason },
        },
        tx,
      );
    });
    return { manualGroupKey, affectedCaseIds: caseIds };
  }

  /**
   * Teamlead-Korrektur „Lieferung" (Teamlead-Punkt 1): split Belege out of a group — each
   * becomes solo and is frozen against auto re-detection. Serves „trennen"/„entfernen".
   */
  async splitDeliveryGroup(
    principal: Principal,
    dto: DeliveryGroupEditDto,
  ): Promise<DeliveryGroupEditResultDto> {
    const caseIds = [...new Set(dto.caseIds)];
    if (caseIds.length === 0) {
      throw new BadRequestException('Keine Belege angegeben.');
    }
    const found = await this.prisma.goodsReceiptCase.findMany({
      where: { id: { in: caseIds } },
      select: { id: true },
    });
    if (found.length !== caseIds.length) {
      throw new NotFoundException('Mindestens ein Beleg wurde nicht gefunden.');
    }
    await this.prisma.$transaction(async (tx) => {
      for (const id of caseIds) {
        await tx.goodsReceiptCase.update({
          where: { id },
          data: { manualDeliveryGroupKey: `solo:${id}`, version: { increment: 1 } },
        });
      }
      await this.events.append(
        {
          eventType: 'case.delivery_group_split',
          entityType: 'GoodsReceiptCase',
          entityId: caseIds[0]!,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: { caseIds, reason: dto.reason },
        },
        tx,
      );
    });
    return { manualGroupKey: null, affectedCaseIds: caseIds };
  }

  /**
   * Intake-Gate (D1) „Zurück an Bucher": mock Queue/Benachrichtigung für einen
   * blocked-Beleg — es wird nichts nach ProHandel geschrieben, nur ein revisions-
   * sicheres Ereignis erzeugt, das die (gemockte) Bucher-Queue speist.
   */
  async returnToBucher(
    principal: Principal,
    caseId: string,
    dto: { note?: string },
  ): Promise<TransitionResultDto> {
    const found = await this.prisma.goodsReceiptCase.findUnique({ where: { id: caseId } });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);
    if (found.status !== 'blocked') {
      throw new ConflictException('Nur blockierte Belege können an den Bucher zurückgehen.');
    }
    const eventId = await this.prisma.$transaction(async (tx) => {
      const event = await this.events.append(
        {
          eventType: 'case.returned_to_bucher',
          entityType: 'GoodsReceiptCase',
          entityId: caseId,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: {
            weBelegNo: found.weBelegNo,
            missingFields: found.missingFields,
            note: dto.note,
          },
        },
        tx,
      );
      return event.id;
    });
    return { caseId, status: found.status, version: found.version, eventId };
  }

  /**
   * Intake-Gate (D1) Freigabe: fehlende Pflichtfelder nachtragen (mock: der Bucher
   * hat in ProHandel vervollständigt bzw. der TL trägt nach). Sind alle Pflicht-
   * felder da, wechselt der Beleg blocked → ready und geht zurück in den Pool.
   */
  async completeIntake(
    principal: Principal,
    caseId: string,
    dto: { storageLocationId?: string; deliveryNoteNo?: string },
  ): Promise<TransitionResultDto> {
    const found = await this.prisma.goodsReceiptCase.findUnique({ where: { id: caseId } });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);
    if (found.status !== 'blocked') {
      throw new ConflictException('Nur blockierte Belege können vervollständigt werden.');
    }
    if (dto.storageLocationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: dto.storageLocationId },
      });
      if (!location) throw new BadRequestException('Unbekannter Lagerplatz.');
    }

    const storageLocationId = dto.storageLocationId ?? found.storageLocationId;
    const deliveryNoteNo = dto.deliveryNoteNo ?? found.deliveryNoteNo;
    const missingFields: string[] = [];
    if (!storageLocationId) missingFields.push('Lagerplatz');
    if (!deliveryNoteNo) missingFields.push('Lieferschein');
    const released = missingFields.length === 0;
    if (released) assertTransition('blocked', 'ready');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.goodsReceiptCase.update({
        where: { id: caseId },
        data: {
          storageLocationId,
          deliveryNoteNo,
          missingFields,
          ...(released ? { status: 'ready' as const } : {}),
          version: { increment: 1 },
        },
      });
      const event = released
        ? await this.events.append(
            {
              eventType: 'case.intake_released',
              entityType: 'GoodsReceiptCase',
              entityId: caseId,
              actorType: 'teamlead',
              actorId: principal.sub,
              payload: { weBelegNo: found.weBelegNo },
            },
            tx,
          )
        : null;
      return {
        caseId,
        status: updated.status,
        version: updated.version,
        eventId: event?.id ?? null,
      };
    });
  }

  /**
   * Lieferungs-Pool-Hold (D2) „trotzdem bearbeiten": eine unvollständige Lieferung
   * („X von N") explizit freigeben — alle Mitglieder erhalten das Release-Flag und
   * verteilen sich wieder, obwohl noch Belege der Lieferung fehlen.
   */
  async releaseDeliveryGroup(
    principal: Principal,
    dto: { caseIds: string[]; reason?: string },
  ): Promise<{ affectedCaseIds: string[] }> {
    const caseIds = [...new Set(dto.caseIds)];
    if (caseIds.length === 0) throw new BadRequestException('Keine Belege angegeben.');
    const found = await this.prisma.goodsReceiptCase.findMany({
      where: { id: { in: caseIds } },
      select: { id: true },
    });
    if (found.length !== caseIds.length) {
      throw new NotFoundException('Mindestens ein Beleg wurde nicht gefunden.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceiptCase.updateMany({
        where: { id: { in: caseIds } },
        data: { deliveryGroupReleased: true, version: { increment: 1 } },
      });
      await this.events.append(
        {
          eventType: 'case.delivery_group_released',
          entityType: 'GoodsReceiptCase',
          entityId: caseIds[0]!,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: { caseIds, reason: dto.reason },
        },
        tx,
      );
    });
    return { affectedCaseIds: caseIds };
  }

  async deprioritize(
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
    flags.delete('manual_teamlead_priority');

    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceiptCase.update({
        where: { id: caseId },
        data: { priorityFlags: [...flags], version: { increment: 1 } },
      });
      await this.events.append(
        {
          eventType: 'case.deprioritized',
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
   * „Problem freigeben" — resolve a case's open problem and put it back to work.
   * Case-scoped (not issue-scoped) so the action works from every surface that
   * shows the case (Ablagen card, Belege list/detail) without threading an issue id.
   * A case in `issue_open` has exactly one open issue.
   */
  async resolveIssue(
    principal: Principal,
    caseId: string,
    dto: ResolveIssueDto,
  ): Promise<TransitionResultDto> {
    const issue = await this.prisma.issue.findFirst({
      where: { caseId, status: { in: ['open', 'in_review', 'waiting_external'] } },
      select: { id: true },
    });
    if (!issue) throw new NotFoundException(`Case ${caseId} has no open issue`);

    return this.prisma.$transaction(async (tx) => {
      await tx.issue.update({
        where: { id: issue.id },
        data: {
          status: 'resolved',
          resolution: dto.resolution,
          releasedBy: principal.sub,
          releasedAt: new Date(),
        },
      });
      const result = await this.workflow.transition({
        caseId,
        toStatus: 'in_progress',
        eventType: 'issue.resolved',
        actor: { actorType: 'teamlead', actorId: principal.sub },
        payload: { issueId: issue.id },
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
      const { plannedEffortMinutes, caseIds } = await this.addCaseToBundleTx(tx, bundle, dto.caseId);
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
   * §8.4 Manuelle Zuweisung „Beleg → Mitarbeiter" vom Mitarbeiterboard. Has the
   * employee already a (non-terminal) Bündel for the day, the Beleg is appended to
   * it; is the employee FREE, this CREATES the day's Bündel (`createdBy=teamlead`,
   * `status=assigned`) and places the Beleg as its first member. A pure override —
   * it does NOT run the engine; it reuses the exact §8.4 append path
   * ({@link addCaseToBundleTx}). The Beleg's Bereich is a SOFT signal handled in the
   * UI: a Bereich mismatch is never blocked here. A later `recalculate` re-plans the
   * day and can overwrite the manual Bündel (same caveat as every §8.4 override).
   */
  async assignToEmployee(
    principal: Principal,
    employeeNo: string,
    dto: AssignToEmployeeDto,
    now: Date = new Date(),
  ): Promise<BundleMutationResultDto> {
    const day = resolveDay(dto.date, now);
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.user.findUnique({
        where: { employeeNo },
        select: { id: true, active: true },
      });
      if (!employee) throw new NotFoundException(`Employee ${employeeNo} not found`);
      if (!employee.active) throw new ConflictException(`Employee ${employeeNo} is inactive`);

      // The board folds the earliest non-terminal Bündel of the day; find that one
      // (or create it). There is no @@unique([employeeId, date]) — find-then-create.
      const existing = await tx.assignmentBundle.findFirst({
        where: { employeeId: employee.id, date: day, status: { notIn: TERMINAL_BUNDLE_STATUSES } },
        orderBy: { createdAt: 'asc' },
        include: { items: { orderBy: { sequence: 'asc' }, select: { id: true, caseId: true } } },
      });

      let bundle: { id: string; status: AssignmentStatus; items: { caseId: string }[] };
      let bundleCreated = false;
      if (existing) {
        bundle = { id: existing.id, status: existing.status, items: existing.items };
      } else {
        const created = await tx.assignmentBundle.create({
          data: {
            employeeId: employee.id,
            date: day,
            status: 'assigned',
            createdBy: 'teamlead',
            plannedEffortMinutes: 0,
          },
          select: { id: true, status: true },
        });
        bundle = { id: created.id, status: created.status, items: [] };
        bundleCreated = true;
      }

      const { plannedEffortMinutes, caseIds } = await this.addCaseToBundleTx(
        tx,
        bundle,
        dto.caseId,
      );
      const eventId = await this.auditOverride(tx, principal, bundle.id, 'manual_assign', dto.reason, {
        caseId: dto.caseId,
        employeeNo,
        bundleCreated,
      });
      return {
        bundleId: bundle.id,
        bundleStatus: bundle.status,
        plannedEffortMinutes,
        caseIds,
        caseId: dto.caseId,
        caseStatus: 'assigned',
        eventId,
        bundleCreated,
      };
    });
  }

  /**
   * Shared §8.4 append used by {@link addToBundle} (existing Bündel) and
   * {@link assignToEmployee} (free head): validate the Bündel is non-terminal and the
   * Beleg is `ready`, create the item at the tail, move the case to `assigned`, link
   * it, recompute the Bündel's planned effort. Caller owns the audit event + result.
   */
  private async addCaseToBundleTx(
    tx: PrismaTx,
    bundle: { id: string; status: AssignmentStatus; items: { caseId: string }[] },
    caseId: string,
  ): Promise<{ plannedEffortMinutes: number; caseIds: string[] }> {
    if (TERMINAL_BUNDLE_STATUSES.includes(bundle.status)) {
      throw new ConflictException(`Bundle ${bundle.id} is ${bundle.status} and cannot take cases`);
    }
    const theCase = await tx.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true },
    });
    if (!theCase) throw new NotFoundException(`Case ${caseId} not found`);
    if (theCase.status !== 'ready') {
      throw new ConflictException(`Only a ready case can be assigned (case is ${theCase.status})`);
    }

    const nextSeq = bundle.items.length;
    await tx.assignmentItem.create({ data: { bundleId: bundle.id, caseId, sequence: nextSeq } });
    await tx.goodsReceiptCase.update({
      where: { id: caseId },
      data: { status: 'assigned', assignedBundleId: bundle.id, version: { increment: 1 } },
    });

    const caseIds = [...bundle.items.map((i) => i.caseId), caseId];
    const plannedEffortMinutes = await this.recomputeEffort(tx, caseIds);
    await tx.assignmentBundle.update({
      where: { id: bundle.id },
      data: { plannedEffortMinutes },
    });
    return { plannedEffortMinutes, caseIds };
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
