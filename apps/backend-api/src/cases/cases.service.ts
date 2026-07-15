import {
  BadRequestException,
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
import {
  deriveImplicitProblems,
  type ReportedSkuState,
} from '../modules/issue/derive-problems.js';
import type { Principal } from '../auth/rbac.js';
import { assertCanAccessCase, canAccessCase, CaseAccessDeniedError } from './case-access.policy.js';
import {
  type CaseAggregateDto,
  type CaseSummaryDto,
  type ClaimWorkstationDto,
  type CompleteDto,
  type CurrentBundleDto,
  type MeWorkstationDto,
  type ParkRemainingDto,
  type ParkRemainingResultDto,
  type PartialCompleteDto,
  type ReceiptPositionDto,
  type ReportedProblemDto,
  type SkuQuantityDto,
  type TodayResponseDto,
  type TransitionResultDto,
} from './cases.dto.js';
import { recomputeEffort, resequenceItems, resequenceRouteStops } from './bundle-mutations.js';
import {
  wgrDescription,
  distinctShopNos,
  isLabelsRequired,
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
const TERMINAL_CASE_STATUSES = ['completed', 'zst_done', 'cancelled'] as const;
/** A bundle in one of these is already closed — don't re-complete it. */
const TERMINAL_BUNDLE_STATUSES: string[] = ['completed', 'cancelled'];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Bündel-Reihenfolge, wie die assignment-engine sie beschlossen hat
 * (`AssignmentItem.sequence`). Vorher sortierte `/api/me/today` allein nach
 * `bookingDate`; alle Belege eines Tages tragen dasselbe Datum, die Reihenfolge
 * war damit undefiniert und kippte, sobald eine Zeile geschrieben wurde. Der
 * Bündel-Home leitet daraus „Start Bearbeitung WE …" ab — der Vorschlag sprang.
 *
 * Ein Beleg hat wegen `@@unique([caseId])` höchstens EIN Item. Fehlt es (ein
 * Beleg kann seine Bündel-Bindung behalten, aber sein Item verlieren — siehe
 * `clearPriorPlanForDate`), sortiert er ans Ende. Die
 * WE-Nummer bricht jeden verbleibenden Gleichstand, damit die Ordnung total ist.
 */
function byBundleSequence(
  a: { weBelegNo: string; assignmentItems: { sequence: number }[] },
  b: { weBelegNo: string; assignmentItems: { sequence: number }[] },
): number {
  const seqA = a.assignmentItems[0]?.sequence ?? Number.MAX_SAFE_INTEGER;
  const seqB = b.assignmentItems[0]?.sequence ?? Number.MAX_SAFE_INTEGER;
  return seqA !== seqB ? seqA - seqB : a.weBelegNo.localeCompare(b.weBelegNo);
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
            // A1/A3 summary fields: Etiketten (derived) + Mehr-Shop list.
            workInstruction: { select: { priceLabelPrintRequired: true, boxLabelRequired: true } },
            positions: { select: { shopNo: true }, orderBy: { positionNo: 'asc' } },
            // Die Bündel-Reihenfolge der Engine. Prisma kann nicht über eine
            // To-many-Relation sortieren — deshalb unten in JS.
            assignmentItems: { select: { sequence: true } },
          },
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
      cases: [...bundle.cases]
        .sort(byBundleSequence)
        .map((c) => this.mapSummary(c, assignedEmployeeName)),
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
      orderNo?: string | null;
      onlineRelevant?: boolean | null;
      branchNo: string;
      shopNo: string;
      hShopNo: string | null;
      floor: string | null;
      status: string;
      catMan?: boolean | null;
      catManDate?: Date | null;
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
      catManDate: p.catManDate ? isoDay(p.catManDate) : null,
      supplierArticleNo: p.supplierArticleNo,
      supplierColor: p.supplierColor,
      season: p.season,
      nosFlag: p.nosFlag,
      orderNo: p.orderNo ?? null,
      branchNo: p.branchNo,
      shopNo: p.shopNo,
      hShopNo: p.hShopNo,
      floor: p.floor,
      status: p.status,
      instruction: p.instruction ? mapPositionInstruction(p.instruction) : null,
      skuLines: p.skuLines.map((s) => mapSkuLine(s, marks[s.size] ?? null)),
    };
  }

  async startPreparation(principal: Principal, caseId: string): Promise<TransitionResultDto> {
    const owned = await this.requireOwnedCase(principal, caseId);
    // problem_resolved → in_progress: derselbe MA setzt nach der Teamlead-Klärung fort.
    const resuming = owned.status === 'problem_resolved';
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'in_progress',
      eventType: resuming ? 'case.resumed' : 'case.started',
      actor: { actorType: 'employee', actorId: principal.sub },
      expectedVersion: owned.version,
    });
    // The cart is now in work — mark its bundle active (assigned → active) so the
    // board / getCurrentBundle reflect the running cart (§ continuation, Frei/Fix).
    await this.activateBundle(owned.id);
    return this.finish(principal, result);
  }

  async complete(principal: Principal, caseId: string, dto: CompleteDto = {}): Promise<TransitionResultDto> {
    const owned = await this.requireOwnedCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    const caseRow = await this.prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: owned.id },
      select: { totalQuantity: true, effortPoints: true },
    });
    // Punkt 7 (Kundenfeedback 14.07.2026): Mehr-/Minderlieferung oder Preis-
    // abweichung ist AUTOMATISCH ein Problem und erzwingt den Teilabschluss —
    // „Beleg erledigt" (voll) ist dann nicht erlaubt.
    const skuStates = await this.resolveSkuStates(owned.id, dto.skuQuantities ?? []);
    const implicit = deriveImplicitProblems(skuStates);
    if (implicit.length > 0) {
      throw new BadRequestException(
        'Beleg hat Mengen-/Preisabweichungen – Teilabschluss verwenden',
      );
    }
    const openIssues = await this.prisma.issue.count({
      where: { caseId: owned.id, status: 'open' },
    });
    if (openIssues > 0) {
      throw new BadRequestException('Beleg hat offene Probleme – Teilabschluss verwenden');
    }
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'completed',
      eventType: 'case.completed',
      actor: { actorType: 'employee', actorId: principal.sub },
      expectedVersion: owned.version,
    });
    await this.persistSkuConfirmations(skuStates);
    // §17.1 ZST: digital completion produces the ZST record + KPI basis. Uses the
    // employee's actual counted quantities when supplied, else the Soll total.
    const completedQuantity =
      skuStates.length > 0
        ? skuStates.reduce((sum, s) => sum + s.confirmedQuantity, 0)
        : caseRow.totalQuantity;
    await this.writeZst(principal, owned.id, employee.id, {
      countedQuantity: completedQuantity,
      caseTotalQuantity: caseRow.totalQuantity,
      caseEffortPoints: caseRow.effortPoints,
    });
    // §continuation: if this was the bundle's last open case, close the bundle.
    await this.closeBundleIfDone(principal, owned.id);
    return this.finish(principal, result);
  }

  /**
   * Teilabschluss (Kundenfeedback 14.07.2026): schickt die während der Bearbeitung
   * gesammelten Probleme gebündelt an den Teamlead. Manuelle Probleme kommen aus
   * dem Problemarten-Katalog; Mehr-/Minderlieferungen und Preisabweichungen werden
   * hier aus den gemeldeten SKU-Mengen abgeleitet (implizite Probleme). Der Beleg
   * bleibt beim SELBEN Mitarbeiter rot geparkt (issue_open), bis der Teamlead klärt.
   */
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
    const skuStates = await this.resolveSkuStates(owned.id, dto.skuQuantities);
    const implicit = deriveImplicitProblems(skuStates);
    const manual = await this.validateManualProblems(owned.id, dto.problems);
    if (implicit.length === 0 && manual.length === 0) {
      throw new BadRequestException(
        'Teilabschluss braucht mindestens ein Problem – sonst „Beleg erledigt" verwenden',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      for (const p of manual) {
        await tx.issue.create({
          data: {
            caseId: owned.id,
            scope: p.skuLineId ? 'sku_line' : 'position',
            scopeId: p.skuLineId ?? p.positionId,
            employeeId: employee.id,
            kind: 'manual',
            reasonId: p.reasonId,
            reasonLabel: p.reasonLabel,
            description: p.note,
          },
        });
      }
      for (const p of implicit) {
        await tx.issue.create({
          data: {
            caseId: owned.id,
            scope: 'sku_line',
            scopeId: p.skuLineId,
            employeeId: employee.id,
            kind: p.kind,
            deviationQty: p.deviationQty,
            expectedVkPrice: p.expectedVkPrice,
            correctedVkPrice: p.correctedVkPrice,
          },
        });
      }
      return this.workflow.transition({
        caseId: owned.id,
        toStatus: 'issue_open',
        eventType: 'case.problems_reported',
        actor: { actorType: 'employee', actorId: principal.sub },
        payload: {
          manualCount: manual.length,
          implicitCount: implicit.length,
          kinds: [...new Set([...manual.map(() => 'manual'), ...implicit.map((p) => p.kind)])],
        },
        expectedVersion: owned.version,
      });
    });
    await this.persistSkuConfirmations(skuStates);
    // Partial ZST: prorate the effort by the completed share (§4.6, §15).
    const completedQuantity = skuStates.reduce((sum, s) => sum + s.confirmedQuantity, 0);
    await this.writeZst(principal, owned.id, employee.id, {
      countedQuantity: completedQuantity,
      caseTotalQuantity: caseRow.totalQuantity,
      caseEffortPoints: caseRow.effortPoints,
    });
    return this.finish(principal, result);
  }

  /**
   * Löst die gemeldeten SKU-Stände gegen die Beleg-Daten auf (Soll, Etikettpreis).
   * Unbekannte skuLineIds sind ein Client-Fehler.
   */
  private async resolveSkuStates(
    caseId: string,
    skuQuantities: SkuQuantityDto[],
  ): Promise<ReportedSkuState[]> {
    if (skuQuantities.length === 0) return [];
    const lines = await this.prisma.receiptSkuLine.findMany({
      where: { position: { caseId } },
      select: {
        id: true,
        expectedQuantity: true,
        vkLabelPrice: true,
        receiptPositionId: true,
      },
    });
    const byId = new Map(lines.map((l) => [l.id, l]));
    return skuQuantities.map((q) => {
      const line = byId.get(q.skuLineId);
      if (!line) {
        throw new BadRequestException(`Größenzeile ${q.skuLineId} gehört nicht zu diesem Beleg`);
      }
      return {
        skuLineId: line.id,
        positionId: line.receiptPositionId,
        expectedQuantity: line.expectedQuantity,
        confirmedQuantity: q.confirmedQuantity,
        vkLabelPrice: line.vkLabelPrice,
        correctedVkPrice: q.correctedVkPrice ?? null,
      };
    });
  }

  /** Validates the reported problems against the case + active reason catalog. */
  private async validateManualProblems(
    caseId: string,
    problems: ReportedProblemDto[],
  ): Promise<Array<ReportedProblemDto & { reasonLabel: string }>> {
    if (problems.length === 0) return [];
    const [positions, reasons] = await Promise.all([
      this.prisma.receiptPosition.findMany({ where: { caseId }, select: { id: true } }),
      this.prisma.problemReason.findMany({
        where: { id: { in: [...new Set(problems.map((p) => p.reasonId))] }, active: true },
        select: { id: true, label: true },
      }),
    ]);
    const positionIds = new Set(positions.map((p) => p.id));
    const labelById = new Map(reasons.map((r) => [r.id, r.label]));
    return problems.map((p) => {
      if (!positionIds.has(p.positionId)) {
        throw new BadRequestException(`Position ${p.positionId} gehört nicht zu diesem Beleg`);
      }
      const reasonLabel = labelById.get(p.reasonId);
      if (!reasonLabel) {
        throw new BadRequestException(`Problemart ${p.reasonId} ist unbekannt oder inaktiv`);
      }
      return { ...p, reasonLabel };
    });
  }

  /** Persists the counted Ist per SKU line (`deviation` when Ist≠Soll). */
  private async persistSkuConfirmations(skuStates: ReportedSkuState[]): Promise<void> {
    if (skuStates.length === 0) return;
    await this.prisma.$transaction(
      skuStates.map((s) =>
        this.prisma.receiptSkuLine.update({
          where: { id: s.skuLineId },
          data: {
            confirmedQuantity: s.confirmedQuantity,
            status: s.confirmedQuantity === s.expectedQuantity ? 'confirmed' : 'deviation',
          },
        }),
      ),
    );
  }

  /**
   * Persists the ZST completion record + zst.created audit event (§15.1).
   * Bucht nur das DELTA zum bereits verbuchten Stand des Belegs: nach einem
   * Teilabschluss (Problem-Loop) zählt der spätere Abschluss desselben Belegs
   * nur die restliche Menge — keine Doppelzählung in der KPI-Basis.
   * Idempotent per (case, kumulierte Menge) so a retry does not double-count.
   */
  private async writeZst(
    principal: Principal,
    caseId: string,
    employeeId: string,
    zst: { countedQuantity: number; caseTotalQuantity: number; caseEffortPoints: number },
  ): Promise<void> {
    const idempotencyKey = `zst:${caseId}:${zst.countedQuantity}`;
    const existing = await this.prisma.zstRecord.findUnique({ where: { idempotencyKey } });
    if (existing) return;
    const booked = await this.prisma.zstRecord.aggregate({
      where: { caseId },
      _sum: { completedQuantity: true },
    });
    const deltaQuantity = zst.countedQuantity - (booked._sum.completedQuantity ?? 0);
    if (deltaQuantity <= 0) return;
    const effortPoints = proratedEffort(zst.caseTotalQuantity, deltaQuantity, zst.caseEffortPoints);
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.zstRecord.create({
        data: {
          idempotencyKey,
          caseId,
          employeeId,
          completedQuantity: deltaQuantity,
          effortPoints,
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
          payload: { caseId, completedQuantity: deltaQuantity, effortPoints },
          idempotencyKey: `zst-evt:${record.id}`,
        },
        tx,
      );
    });
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
      branchNo: string;
      docuWareUrl: string | null;
      completedAt: Date | null;
      attentionFlag: boolean;
      attentionNote: string | null;
      forwardedTo: string | null;
      workInstruction?: { priceLabelPrintRequired: boolean; boxLabelRequired: boolean } | null;
      positions?: { shopNo: string }[];
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
      branchNo: c.branchNo,
      labelsRequired: isLabelsRequired(c.workInstruction),
      shopNos: distinctShopNos(c.primaryShopNo ?? null, c.positions ?? []),
      docuWareUrl: c.docuWareUrl,
      completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      attentionFlag: c.attentionFlag,
      attentionNote: c.attentionNote,
      forwardedTo: c.forwardedTo,
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
