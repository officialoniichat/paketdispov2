import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CaseStatus } from '@paket/domain-types';
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
  type CreateIssueDto,
  type CurrentBundleDto,
  type PartialCompleteDto,
  type ReceiptPositionDto,
  type TodayResponseDto,
  type TransitionResultDto,
  type TransportBoxTargetDto,
  type WorkInstructionHeaderDto,
} from './cases.dto.js';

interface CaseOwnership {
  id: string;
  status: CaseStatus;
  version: number;
  ownerEmployeeNo: string | null;
}

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
        routeStops: { orderBy: { sequence: 'asc' } },
        cases: { include: { storageLocation: true }, orderBy: { bookingDate: 'asc' } },
      },
    });

    if (!bundle) {
      return { date: isoDay(today), bundle: null, cases: [] };
    }

    return {
      date: isoDay(today),
      bundle: this.mapBundle(bundle),
      cases: bundle.cases.map((c) => this.mapSummary(c)),
    };
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
        positions: { orderBy: { positionNo: 'asc' } },
        transportBoxes: { orderBy: { boxNo: 'asc' } },
        assignedBundle: { select: { employee: { select: { employeeNo: true } } } },
      },
    });
    if (!found) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    const ownerEmployeeNo = found.assignedBundle?.employee?.employeeNo ?? null;
    if (!canAccessCase(principal, ownerEmployeeNo)) {
      throw new ForbiddenException(`Access to case ${caseId} denied`);
    }
    return {
      case: this.mapSummary(found),
      workInstruction: found.workInstruction
        ? this.mapWorkInstruction(found.workInstruction)
        : null,
      positions: found.positions.map((p) => this.mapPosition(p)),
      boxTargets: found.transportBoxes.map((b) => this.mapBoxTarget(b)),
    };
  }

  private mapWorkInstruction(wi: {
    priceLabelPrintRequired: boolean;
    sortByArticleColorSizeRequired: boolean;
    goodsReceiptCheckMode: string;
    goodsReceiptCheckPercentage: number | null;
    minimumQuantityCheckAlwaysRequired: boolean;
    boxLabelRequired: boolean;
    zstRequired: boolean;
  }): WorkInstructionHeaderDto {
    return {
      priceLabelPrintRequired: wi.priceLabelPrintRequired,
      sortByArticleColorSizeRequired: wi.sortByArticleColorSizeRequired,
      goodsReceiptCheckMode: wi.goodsReceiptCheckMode,
      goodsReceiptCheckPercentage: wi.goodsReceiptCheckPercentage,
      minimumQuantityCheckAlwaysRequired: wi.minimumQuantityCheckAlwaysRequired,
      boxLabelRequired: wi.boxLabelRequired,
      zstRequired: wi.zstRequired,
    };
  }

  private mapPosition(p: {
    id: string;
    positionNo: number;
    wgr: string;
    supplierArticleNo: string;
    supplierColor: string;
    season: string | null;
    branchNo: string;
    shopNo: string;
    floor: string | null;
    status: string;
  }): ReceiptPositionDto {
    return {
      id: p.id,
      positionNo: p.positionNo,
      wgr: p.wgr,
      supplierArticleNo: p.supplierArticleNo,
      supplierColor: p.supplierColor,
      season: p.season,
      branchNo: p.branchNo,
      shopNo: p.shopNo,
      floor: p.floor,
      status: p.status,
    };
  }

  private mapBoxTarget(b: {
    id: string;
    boxNo: number;
    branchNo: string;
    shopAreaNo: string;
    shopNo: string | null;
    floor: string | null;
    goodsType: string | null;
    positionIds: string[];
    plannedQuantity: number;
    quantity: number;
    labelStatus: string;
    sealed: boolean;
  }): TransportBoxTargetDto {
    return {
      id: b.id,
      boxNo: b.boxNo,
      branchNo: b.branchNo,
      shopAreaNo: b.shopAreaNo,
      shopNo: b.shopNo,
      floor: b.floor,
      goodsType: b.goodsType,
      positionIds: b.positionIds,
      plannedQuantity: b.plannedQuantity,
      quantity: b.quantity,
      labelStatus: b.labelStatus,
      sealed: b.sealed,
    };
  }

  async startPreparation(principal: Principal, caseId: string): Promise<TransitionResultDto> {
    const owned = await this.requireOwnedCase(principal, caseId);
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'picking',
      eventType: 'case.started',
      actor: { actorType: 'employee', actorId: principal.sub },
      expectedVersion: owned.version,
    });
    return this.finish(principal, result);
  }

  /**
   * §7.1 work chain an employee drives while preparing a package, in order.
   * complete/partialComplete walk this chain up to `boxing` via structural hops
   * (no milestone events) so the documented "Complete a package" endpoints work
   * from any active work state without weakening the transition graph.
   */
  private static readonly WORK_CHAIN: readonly CaseStatus[] = [
    'assigned',
    'picking',
    'preparing',
    'sorting',
    'checking',
    'boxing',
  ];

  /**
   * Advance the case along the legal work chain to `boxing` if it is not there
   * yet, performing each edge as a structural hop. Returns the version after the
   * last hop (or the input version when already at/after boxing).
   */
  private async advanceToBoxing(
    principal: Principal,
    caseId: string,
    fromStatus: CaseStatus,
    fromVersion: number,
  ): Promise<{ version: number }> {
    const startIndex = CasesService.WORK_CHAIN.indexOf(fromStatus);
    const boxingIndex = CasesService.WORK_CHAIN.indexOf('boxing');
    // Unknown state (e.g. labeling/securing/released) or already at boxing: the
    // terminal transition below validates the edge and fails fast if illegal.
    if (startIndex < 0 || startIndex >= boxingIndex) {
      return { version: fromVersion };
    }
    let version = fromVersion;
    for (let i = startIndex + 1; i <= boxingIndex; i += 1) {
      const result = await this.workflow.transition({
        caseId,
        toStatus: CasesService.WORK_CHAIN[i] as CaseStatus,
        actor: { actorType: 'employee', actorId: principal.sub },
        expectedVersion: version,
      });
      version = result.version;
    }
    return { version };
  }

  async complete(principal: Principal, caseId: string): Promise<TransitionResultDto> {
    const owned = await this.requireOwnedCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    const caseRow = await this.prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: owned.id },
      select: { totalQuantity: true, effortPoints: true },
    });
    const { version } = await this.advanceToBoxing(
      principal,
      owned.id,
      owned.status,
      owned.version,
    );
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'completed',
      eventType: 'case.completed',
      actor: { actorType: 'employee', actorId: principal.sub },
      expectedVersion: version,
    });
    // §17.1 ZST: digital completion produces the ZST record + KPI basis.
    await this.writeZst(principal, owned.id, employee.id, {
      completedQuantity: caseRow.totalQuantity,
      effortPoints: caseRow.effortPoints,
    });
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
    const { version } = await this.advanceToBoxing(
      principal,
      owned.id,
      owned.status,
      owned.version,
    );
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'partially_completed',
      eventType: 'case.partially_completed',
      actor: { actorType: 'employee', actorId: principal.sub },
      payload: { reason: dto.reason, completedQuantity: dto.completedQuantity },
      expectedVersion: version,
    });
    // Partial ZST: prorate the effort by the completed share (§4.6, §15).
    const completedQuantity = dto.completedQuantity ?? 0;
    await this.writeZst(principal, owned.id, employee.id, {
      completedQuantity,
      effortPoints: proratedEffort(caseRow.totalQuantity, completedQuantity, caseRow.effortPoints),
    });
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
      status: found.status as CaseStatus,
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

  private mapSummary(c: {
    id: string;
    weBelegNo: string;
    status: string;
    section: number | null;
    priorityFlags: string[];
    totalQuantity: number;
    estimatedMinutes: number;
    bookingDate: Date;
    storageLocation: { code: string };
  }): CaseSummaryDto {
    return {
      id: c.id,
      weBelegNo: c.weBelegNo,
      status: c.status,
      section: c.section,
      priorityFlags: c.priorityFlags,
      totalQuantity: c.totalQuantity,
      estimatedMinutes: c.estimatedMinutes,
      storageLocationCode: c.storageLocation.code,
      bookingDate: isoDay(c.bookingDate),
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
