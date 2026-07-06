import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CaseStatus } from '@paket/domain-types';
import {
  caseStatusSchema,
  deriveOnlineSizeMarks,
  deriveWorkInstructionPoints,
} from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { LiveStatusService } from '../live/live.module.js';
import { proratedEffort } from '../modules/completion/completion-logic.js';
import type { Principal } from '../auth/rbac.js';
import { assertCanAccessCase, canAccessCase, CaseAccessDeniedError } from './case-access.policy.js';
import {
  type CaseAggregateDto,
  type CaseSummaryDto,
  type ClaimWorkstationDto,
  type CreateIssueDto,
  type CurrentBundleDto,
  type MeWorkstationDto,
  type ParkRemainingDto,
  type ParkRemainingResultDto,
  type PartialCompleteDto,
  type ReceiptPositionDto,
  type TodayResponseDto,
  type TransitionResultDto,
} from './cases.dto.js';
import { recomputeEffort, resequenceItems, resequenceRouteStops } from './bundle-mutations.js';
import {
  wgrDescription,
  mapBoxTarget,
  mapPositionInstruction,
  mapSkuLine,
  mapWorkInstruction,
  type PositionInstructionRow,
  type SkuLineRow,
} from './mappers.js';

interface CaseOwnership {
  id: string;
  status: CaseStatus;
  version: number;
  ownerEmployeeNo: string | null;
}

/** A case in one of these is "done" for bundle-completion purposes (§ continuation). */
const TERMINAL_CASE_STATUSES = ['completed', 'partially_completed', 'zst_done', 'cancelled'] as const;
/** A bundle in one of these is already closed — don't re-complete it. */
const TERMINAL_BUNDLE_STATUSES: string[] = ['completed', 'cancelled'];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Employee-facing case access (§14.2 /api/me/*, lifecycle) — strictly scoped to
 * the caller's own packages (§16.1). Every mutation runs through WorkflowService
 * so the state machine and audit log stay authoritative.
 */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly events: EventLogService,
    private readonly live: LiveStatusService,
  ) {}

  private async resolveEmployee(principal: Principal): Promise<{ id: string; employeeNo: string }> {
    if (!principal.employeeNo) {
      throw new ForbiddenException('Token has no employee number claim');
    }
    const user = await this.prisma.user.findUnique({
      where: { employeeNo: principal.employeeNo },
      select: { id: true, employeeNo: true, active: true },
    });
    if (!user || !user.active) {
      throw new ForbiddenException('Employee not provisioned or inactive');
    }
    return { id: user.id, employeeNo: user.employeeNo };
  }

  async getToday(principal: Principal): Promise<TodayResponseDto> {
    const employee = await this.resolveEmployee(principal);
    const today = startOfTodayUtc();

    const bundle = await this.prisma.assignmentBundle.findFirst({
      where: { employeeId: employee.id, date: today },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { displayName: true } },
        routeStops: { orderBy: { sequence: 'asc' } },
        cases: {
          include: {
            storageLocation: true,
            workInstruction: { select: { priceLabelPrintRequired: true } },
          },
          orderBy: { bookingDate: 'asc' },
        },
      },
    });

    const workstation = await this.getMyWorkstation(employee.id);
    if (!bundle) {
      return { date: isoDay(today), bundle: null, cases: [], workstation };
    }

    const assignedEmployeeName = bundle.employee.displayName;
    return {
      date: isoDay(today),
      bundle: this.mapBundle(bundle),
      cases: bundle.cases.map((c) => this.mapSummary(c, assignedEmployeeName)),
      workstation,
    };
  }

  /** The employee's currently claimed Arbeitsplatz (Tisch), or null. */
  private async getMyWorkstation(userId: string): Promise<MeWorkstationDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { workstation: { select: { id: true, code: true, name: true } } },
    });
    return user?.workstation ?? null;
  }

  /**
   * A2 Tisch-Anmeldung: der Mitarbeiter identifiziert seinen Arbeitsplatz per
   * Tisch-Nr. oder Barcode-Scan. Persistiert User.workstationId und schreibt den
   * `employee.workstation_assigned` Audit-Event (actorType=employee).
   */
  async claimWorkstation(
    principal: Principal,
    dto: ClaimWorkstationDto,
  ): Promise<MeWorkstationDto> {
    const employee = await this.resolveEmployee(principal);
    const code = dto.code.trim();
    const workstation = await this.prisma.workstation.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, active: true },
      select: { id: true, code: true, name: true },
    });
    if (!workstation) {
      throw new NotFoundException(`Workstation ${code} not found`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: employee.id },
        data: { workstationId: workstation.id },
      });
      await this.events.append(
        {
          eventType: 'employee.workstation_assigned',
          entityType: 'User',
          entityId: employee.id,
          actorType: 'employee',
          actorId: principal.sub,
          payload: { workstationId: workstation.id, code: workstation.code, via: 'me_login' },
        },
        tx,
      );
    });
    return workstation;
  }

  /**
   * B4 Parkposition („Rest parken"): der Karren ist voll — die restlichen, noch
   * nicht begonnenen Belege des eigenen Bündels gehen zurück in den Pool
   * (assigned → ready, Item entfernt). Die Engine plant sie ins nächste Bündel
   * ein. Nur `assigned` (unbegonnene) Belege sind parkbar.
   */
  async parkRemaining(
    principal: Principal,
    dto: ParkRemainingDto,
  ): Promise<ParkRemainingResultDto> {
    const employee = await this.resolveEmployee(principal);
    if (dto.caseIds.length === 0) {
      throw new ConflictException('No cases to park');
    }
    return this.prisma.$transaction(async (tx) => {
      const bundle = await tx.assignmentBundle.findFirst({
        where: { employeeId: employee.id, status: { notIn: ['completed', 'cancelled'] } },
        orderBy: { updatedAt: 'desc' },
        include: { items: { orderBy: { sequence: 'asc' }, include: { case: true } } },
      });
      if (!bundle) {
        throw new NotFoundException('No active bundle to park cases from');
      }
      const itemByCaseId = new Map(bundle.items.map((i) => [i.caseId, i]));
      for (const caseId of dto.caseIds) {
        const item = itemByCaseId.get(caseId);
        if (!item) {
          throw new NotFoundException(`Case ${caseId} is not in the active bundle`);
        }
        if (item.case.status !== 'assigned') {
          throw new ConflictException(
            `Only an unstarted (assigned) case can be parked (case ${caseId} is ${item.case.status})`,
          );
        }
      }

      const parked = new Set(dto.caseIds);
      for (const caseId of dto.caseIds) {
        const item = itemByCaseId.get(caseId);
        if (!item) continue;
        await tx.assignmentItem.delete({ where: { id: item.id } });
        await tx.goodsReceiptCase.update({
          where: { id: caseId },
          data: { status: 'ready', assignedBundleId: null, version: { increment: 1 } },
        });
        await this.events.append(
          {
            eventType: 'case.parked_by_employee',
            entityType: 'GoodsReceiptCase',
            entityId: caseId,
            actorType: 'employee',
            actorId: principal.sub,
            payload: { bundleId: bundle.id, reason: 'cart_full' },
          },
          tx,
        );
      }

      const remaining = bundle.items.filter((i) => !parked.has(i.caseId)).map((i) => i.caseId);
      await resequenceItems(tx, bundle.id, remaining);
      await resequenceRouteStops(tx, bundle.id, remaining);
      const plannedEffortMinutes = await recomputeEffort(tx, remaining);
      await tx.assignmentBundle.update({
        where: { id: bundle.id },
        data: { plannedEffortMinutes },
      });

      return {
        bundleId: bundle.id,
        parkedCaseIds: dto.caseIds,
        remainingCaseIds: remaining,
        plannedEffortMinutes,
      };
    });
  }

  async getCurrentBundle(principal: Principal): Promise<CurrentBundleDto | null> {
    const employee = await this.resolveEmployee(principal);
    const bundle = await this.prisma.assignmentBundle.findFirst({
      where: { employeeId: employee.id, status: { in: ['accepted', 'active'] } },
      orderBy: { updatedAt: 'desc' },
      include: { routeStops: { orderBy: { sequence: 'asc' } }, cases: { select: { id: true } } },
    });
    return bundle ? this.mapBundle(bundle) : null;
  }

  /**
   * §14.2 case aggregate for the PWA: work-instruction header + receipt
   * positions + transport box targets. Scoped to the caller (§16.1) — a missing
   * case is 404, a foreign employee's case is 403 (ForbiddenException).
   */
  async getCaseAggregate(principal: Principal, caseId: string): Promise<CaseAggregateDto> {
    await this.resolveEmployee(principal);
    const found = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      include: {
        storageLocation: true,
        workInstruction: true,
        positions: {
          include: { instruction: true, skuLines: { orderBy: { ean: 'asc' } } },
          orderBy: { positionNo: 'asc' },
        },
        transportBoxes: { orderBy: { boxNo: 'asc' } },
        assignedBundle: {
          select: { employee: { select: { employeeNo: true, displayName: true } } },
        },
      },
    });
    if (!found) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    const ownerEmployeeNo = found.assignedBundle?.employee?.employeeNo ?? null;
    if (!canAccessCase(principal, ownerEmployeeNo)) {
      throw new ForbiddenException(`Access to case ${caseId} denied`);
    }
    // Faithful ordered Arbeitsanweisung projection — single source in domain-types
    // (engine/data decides, UI displays). Empty when no work instruction exists.
    const instructionPoints = found.workInstruction
      ? deriveWorkInstructionPoints(found.workInstruction, found.positions).map((point) => ({
          pointNo: point.pointNo ?? null,
          key: point.key,
          label: point.label,
          value: point.value,
          scope: point.scope,
          positionNos: point.positionNos,
        }))
      : [];
    // A8 Online-Größen-Markierung: Präferenzen der betroffenen WGRs einmal laden,
    // Rot/Grün rein (deriveOnlineSizeMarks) berechnen — die PWA zeigt nur an.
    const onlineWgrs = [
      ...new Set(found.positions.filter((p) => p.onlineRelevant === true).map((p) => p.wgr)),
    ];
    const prefs = onlineWgrs.length
      ? await this.prisma.onlineSizePreference.findMany({ where: { wgr: { in: onlineWgrs } } })
      : [];
    const prefsByWgr = new Map<string, { preferredSize: string; alternativeSize?: string }[]>();
    for (const pref of prefs) {
      const list = prefsByWgr.get(pref.wgr) ?? [];
      list.push({ preferredSize: pref.preferredSize, alternativeSize: pref.alternativeSize ?? undefined });
      prefsByWgr.set(pref.wgr, list);
    }

    return {
      case: this.mapSummary(found, found.assignedBundle?.employee?.displayName ?? null),
      workInstruction: found.workInstruction ? mapWorkInstruction(found.workInstruction) : null,
      positions: found.positions.map((p) => this.mapPosition(p, prefsByWgr)),
      boxTargets: found.transportBoxes.map((b) => mapBoxTarget(b)),
      instructionPoints,
    };
  }

  private mapPosition(
    p: {
      id: string;
      positionNo: number;
      wgr: string;
      supplierArticleNo: string;
      supplierColor: string;
      season: string | null;
      nosFlag: boolean | null;
      onlineRelevant?: boolean | null;
      branchNo: string;
      shopNo: string;
      floor: string | null;
      status: string;
      catMan?: boolean | null;
      instruction: PositionInstructionRow | null;
      skuLines: SkuLineRow[];
    },
    onlinePrefsByWgr?: ReadonlyMap<string, { preferredSize: string; alternativeSize?: string }[]>,
  ): ReceiptPositionDto {
    // A8: Rot/Grün nur für online-relevante Positionen; sonst bleibt jede Zeile null.
    const marks =
      p.onlineRelevant === true
        ? deriveOnlineSizeMarks(
            p.skuLines.map((s) => s.size),
            onlinePrefsByWgr?.get(p.wgr) ?? [],
          )
        : {};
    return {
      id: p.id,
      positionNo: p.positionNo,
      wgr: p.wgr,
      wgrDescription: wgrDescription(p.wgr),
      catMan: p.catMan ?? null,
      supplierArticleNo: p.supplierArticleNo,
      supplierColor: p.supplierColor,
      season: p.season,
      nosFlag: p.nosFlag,
      branchNo: p.branchNo,
      shopNo: p.shopNo,
      floor: p.floor,
      status: p.status,
      instruction: p.instruction ? mapPositionInstruction(p.instruction) : null,
      skuLines: p.skuLines.map((s) => mapSkuLine(s, marks[s.size] ?? null)),
    };
  }

  async startPreparation(principal: Principal, caseId: string): Promise<TransitionResultDto> {
    const owned = await this.requireOwnedCase(principal, caseId);
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'in_progress',
      eventType: 'case.started',
      actor: { actorType: 'employee', actorId: principal.sub },
      expectedVersion: owned.version,
    });
    // The cart is now in work — mark its bundle active (assigned → active) so the
    // board / getCurrentBundle reflect the running cart (§ continuation, Frei/Fix).
    await this.activateBundle(owned.id);
    return this.finish(principal, result);
  }

  async complete(principal: Principal, caseId: string): Promise<TransitionResultDto> {
    const owned = await this.requireOwnedCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    const caseRow = await this.prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: owned.id },
      select: { totalQuantity: true, effortPoints: true },
    });
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'completed',
      eventType: 'case.completed',
      actor: { actorType: 'employee', actorId: principal.sub },
      expectedVersion: owned.version,
    });
    // §17.1 ZST: digital completion produces the ZST record + KPI basis.
    await this.writeZst(principal, owned.id, employee.id, {
      completedQuantity: caseRow.totalQuantity,
      effortPoints: caseRow.effortPoints,
    });
    // §continuation: if this was the bundle's last open case, close the bundle.
    await this.closeBundleIfDone(principal, owned.id);
    return this.finish(principal, result);
  }

  async partialComplete(
    principal: Principal,
    caseId: string,
    dto: PartialCompleteDto,
  ): Promise<TransitionResultDto> {
    const owned = await this.requireOwnedCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    const caseRow = await this.prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: owned.id },
      select: { totalQuantity: true, effortPoints: true },
    });
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'partially_completed',
      eventType: 'case.partially_completed',
      actor: { actorType: 'employee', actorId: principal.sub },
      payload: { reason: dto.reason, completedQuantity: dto.completedQuantity },
      expectedVersion: owned.version,
    });
    // Partial ZST: prorate the effort by the completed share (§4.6, §15).
    const completedQuantity = dto.completedQuantity ?? 0;
    await this.writeZst(principal, owned.id, employee.id, {
      completedQuantity,
      effortPoints: proratedEffort(caseRow.totalQuantity, completedQuantity, caseRow.effortPoints),
    });
    // §continuation: a partial close also frees the bundle once nothing is left open.
    await this.closeBundleIfDone(principal, owned.id);
    return this.finish(principal, result);
  }

  /**
   * Persists the ZST completion record + zst.created audit event (§15.1).
   * Idempotent per (case, quantity) so a retried completion does not double-count.
   */
  private async writeZst(
    principal: Principal,
    caseId: string,
    employeeId: string,
    zst: { completedQuantity: number; effortPoints: number },
  ): Promise<void> {
    const idempotencyKey = `zst:${caseId}:${zst.completedQuantity}`;
    const existing = await this.prisma.zstRecord.findUnique({ where: { idempotencyKey } });
    if (existing) return;
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.zstRecord.create({
        data: {
          idempotencyKey,
          caseId,
          employeeId,
          completedQuantity: zst.completedQuantity,
          effortPoints: zst.effortPoints,
          completedAt: new Date(),
          source: 'mobile_app',
        },
      });
      await this.events.append(
        {
          eventType: 'zst.created',
          entityType: 'ZstRecord',
          entityId: record.id,
          actorType: 'employee',
          actorId: principal.sub,
          payload: { caseId, effortPoints: zst.effortPoints },
          idempotencyKey: `zst-evt:${record.id}`,
        },
        tx,
      );
    });
  }

  async reportIssue(
    principal: Principal,
    caseId: string,
    dto: CreateIssueDto,
  ): Promise<TransitionResultDto> {
    const owned = await this.requireOwnedCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.issue.create({
        data: {
          caseId: owned.id,
          scope: dto.scope as never,
          scopeId: dto.scopeId,
          employeeId: employee.id,
          issueType: dto.issueType as never,
          description: dto.description,
          photoKeys: dto.photoKeys ?? [],
        },
      });
      return this.workflow.transition({
        caseId: owned.id,
        toStatus: 'issue_open',
        eventType: 'issue.created',
        actor: { actorType: 'employee', actorId: principal.sub },
        payload: { scope: dto.scope, issueType: dto.issueType },
        expectedVersion: owned.version,
      });
    });
    return this.finish(principal, result);
  }

  /** Mark the case's bundle `active` once work starts (assigned → active). No-op otherwise. */
  private async activateBundle(caseId: string): Promise<void> {
    const row = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: { assignedBundleId: true },
    });
    if (!row?.assignedBundleId) return;
    await this.prisma.assignmentBundle.updateMany({
      where: { id: row.assignedBundleId, status: 'assigned' },
      data: { status: 'active' },
    });
  }

  /**
   * §continuation: when the last open case of a bundle reaches a terminal state,
   * mark the bundle `completed` + emit `bundle.completed`. That frees the employee
   * to pull the next cart. Idempotent: already-terminal bundles are skipped.
   */
  private async closeBundleIfDone(principal: Principal, caseId: string): Promise<void> {
    const row = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: { assignedBundleId: true },
    });
    const bundleId = row?.assignedBundleId;
    if (!bundleId) return;
    await this.prisma.$transaction(async (tx) => {
      const bundle = await tx.assignmentBundle.findUnique({
        where: { id: bundleId },
        select: { status: true },
      });
      if (!bundle || TERMINAL_BUNDLE_STATUSES.includes(bundle.status)) return;
      const open = await tx.goodsReceiptCase.count({
        where: { assignedBundleId: bundleId, status: { notIn: [...TERMINAL_CASE_STATUSES] } },
      });
      if (open > 0) return;
      await tx.assignmentBundle.update({ where: { id: bundleId }, data: { status: 'completed' } });
      await this.events.append(
        {
          eventType: 'bundle.completed',
          entityType: 'AssignmentBundle',
          entityId: bundleId,
          actorType: 'system',
          actorId: principal.sub,
          payload: { trigger: 'last_case_done' },
        },
        tx,
      );
    });
  }

  /** Loads a case and enforces §16.1 ownership; foreign cases read as 404. */
  private async requireOwnedCase(principal: Principal, caseId: string): Promise<CaseOwnership> {
    const found = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        status: true,
        version: true,
        assignedBundle: { select: { employee: { select: { employeeNo: true } } } },
      },
    });
    if (!found) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    const ownerEmployeeNo = found.assignedBundle?.employee?.employeeNo ?? null;
    try {
      assertCanAccessCase(principal, caseId, ownerEmployeeNo);
    } catch (err) {
      if (err instanceof CaseAccessDeniedError) {
        throw new NotFoundException(`Case ${caseId} not found`);
      }
      throw err;
    }
    return {
      id: found.id,
      status: caseStatusSchema.parse(found.status),
      version: found.version,
      ownerEmployeeNo,
    };
  }

  private mapBundle(bundle: {
    id: string;
    status: string;
    plannedEffortMinutes: number;
    routeStops: Array<{
      id: string;
      sequence: number;
      locationCode: string;
      scanRequired: boolean;
      scannedAt: Date | null;
    }>;
    cases: Array<{ id: string }>;
  }): CurrentBundleDto {
    return {
      bundleId: bundle.id,
      status: bundle.status,
      plannedEffortMinutes: bundle.plannedEffortMinutes,
      caseCount: bundle.cases.length,
      routeStops: bundle.routeStops.map((s) => ({
        id: s.id,
        sequence: s.sequence,
        locationCode: s.locationCode,
        scanRequired: s.scanRequired,
        scanned: s.scannedAt != null,
      })),
    };
  }

  private mapSummary(
    c: {
      id: string;
      weBelegNo: string;
      status: string;
      section: number | null;
      priorityFlags: string[];
      totalQuantity: number;
      estimatedMinutes: number;
      bookingDate: Date;
      goodsTypeText: string | null;
      storageLocation: { code: string; kind?: string } | null;
      primaryShopNo?: string | null;
      inboundCartonCount?: number | null;
      missingFields?: string[];
      workInstruction?: { priceLabelPrintRequired: boolean } | null;
    },
    assignedEmployeeName: string | null,
  ): CaseSummaryDto {
    return {
      id: c.id,
      weBelegNo: c.weBelegNo,
      status: c.status,
      section: c.section,
      priorityFlags: c.priorityFlags,
      totalQuantity: c.totalQuantity,
      estimatedMinutes: c.estimatedMinutes,
      storageLocationCode: c.storageLocation?.code ?? null,
      storageLocationKind: c.storageLocation?.kind ?? null,
      priceLabelPrintRequired: c.workInstruction?.priceLabelPrintRequired ?? null,
      primaryShopNo: c.primaryShopNo ?? null,
      inboundCartonCount: c.inboundCartonCount ?? null,
      missingFields: c.missingFields ?? [],
      bookingDate: isoDay(c.bookingDate),
      goodsType: c.goodsTypeText,
      assignedEmployeeName,
    };
  }

  /** Maps the transition result and broadcasts it on the employee live stream. */
  private finish(
    principal: Principal,
    result: { caseId: string; status: string; version: number; event: { id: string } | null },
  ): TransitionResultDto {
    this.live.publish({
      caseId: result.caseId,
      status: result.status,
      eventType: result.event ? undefined : 'transition',
      employeeNo: principal.employeeNo ?? null,
      at: new Date().toISOString(),
    });
    return this.toResult(result);
  }

  private toResult(result: {
    caseId: string;
    status: string;
    version: number;
    event: { id: string } | null;
  }): TransitionResultDto {
    return {
      caseId: result.caseId,
      status: result.status,
      version: result.version,
      eventId: result.event?.id ?? null,
    };
  }
}
