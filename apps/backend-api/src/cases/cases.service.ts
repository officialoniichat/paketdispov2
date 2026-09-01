import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CaseStatus, LabelPrintVariant } from '@paket/domain-types';
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
  completeGateError,
  partialGateError,
  type GatePosition,
} from '../modules/completion/collaboration-gate.js';
import {
  deriveImplicitProblems,
  describeImplicitProblem,
  type ImplicitProblem,
  type ReportedSkuState,
} from '../modules/issue/derive-problems.js';
import {
  ACTIVE_PARTICIPANT_STATUSES,
  dissolveCollaborationTx,
  isCollaborationActive,
  recipientsForCase,
  toCollaborationDto,
} from '../collaboration/participants.js';
import type { Principal } from '../auth/rbac.js';
import { assertCanAccessCase, canAccessCase, CaseAccessDeniedError } from './case-access.policy.js';
import {
  type CaseAggregateDto,
  type CaseCollaborationDto,
  type CaseSummaryDto,
  type ClaimWorkstationDto,
  type CompleteDto,
  type ConfirmPositionDto,
  type CountSkuLineDto,
  type CurrentBundleDto,
  type IssueSummaryDto,
  type MeWorkstationDto,
  type ParkRemainingDto,
  type ParkRemainingResultDto,
  type PartialCompleteDto,
  type PositionConfirmResultDto,
  type ReceiptPositionDto,
  type ReopenIssueDto,
  type ReportedProblemDto,
  type SetCollectedDto,
  type SetCollectedResultDto,
  type SkuCountResultDto,
  type SkuQuantityDto,
  type TodayResponseDto,
  type TransitionResultDto,
} from './cases.dto.js';
import { recomputeEffort, resequenceItems, resequenceRouteStops } from './bundle-mutations.js';
import { packCount, packOrdinal, packWindow, type PackItem } from './pack-window.js';
import { ClockService } from '../clock/clock.service.js';
import {
  wgrDescription,
  distinctShopNos,
  earliestCatManDate,
  isLabelsRequired,
  mapBoxTarget,
  mapIssueSummary,
  mapLabelPrintPositions,
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
  /** employeeNos der AKTIVEN Beteiligten (angenommen|teil_erledigt, Konzept §5.1). */
  participantEmployeeNos: string[];
}

/**
 * Effektiver Stand einer Größenzeile für Abschluss/Teilabschluss (Konzept §7):
 * Body-Wert, wenn der Aufrufer die Zeile angefasst hat, sonst der persistierte
 * Stand aus dem Zähl-Endpunkt (`confirmedQuantity ?? Soll`, `correctedVkPrice`).
 */
interface EffectiveSkuState extends ReportedSkuState {
  /** true = im Body enthalten — nur diese Zeilen werden beim Abschluss persistiert. */
  fromBody: boolean;
  /** true = der Body trug das Feld `correctedVkPrice` explizit. */
  correctedVkPriceTouched: boolean;
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
 * war damit undefiniert und kippte, sobald eine Zeile geschrieben wurde — die
 * Beleg-Liste im Bündel-Home sprang.
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

/**
 * UTC-Tagesanfang zu einem Zeitpunkt. Den Zeitpunkt liefert IMMER der
 * ClockService (Dev-Zeit-Override oder Systemzeit) — nie `new Date()` direkt:
 * zwei Uhren im selben Fluss haben genau die Geisterbündel erzeugt, bei denen
 * der Pull „gestern" suchte, während die App „heute" zeigte.
 */
function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Row-Umfang der Mitarbeiter-Beleg-Karte (/api/me/today) — geteilt vom eigenen
 * Bündel und von „Geteilt mit dir" (Konzept §3.5), damit beide Karten identisch
 * projiziert werden.
 */
const TODAY_CASE_INCLUDE = {
  storageLocation: true,
  // A1/A3 summary fields: Etiketten (derived) + Mehr-Shop list.
  workInstruction: { select: { priceLabelPrintRequired: true, boxLabelRequired: true } },
  // Etikett-Druckvariante je Position (Kundenfeedback 03.08.2026): die
  // Beleg-Karte unter „1 · Ware holen" und das Barcode-Pop-up zeigen daraus,
  // welche Position ohne Preis zu drucken ist. shopNo → A3 Mehr-Shop-Liste;
  // catManDate → frühester CatMan-Termin des Belegs. confirmedById → Prüf-
  // Fortschritt der Zusammenarbeit (Konzept §7, CaseCollaborationDto).
  positions: {
    select: {
      id: true,
      positionNo: true,
      orderNo: true,
      supplierArticleNo: true,
      supplierColor: true,
      shopNo: true,
      catManDate: true,
      confirmedById: true,
      instruction: { select: { labelPrintVariant: true } },
      // Größenzeilen-Anker für die Meldungs-Zuordnung (scope=sku_line).
      skuLines: { select: { id: true, ean: true, size: true } },
    },
    orderBy: { positionNo: 'asc' as const },
  },
  // Instruktions-Loop (04.08.2026): Zähler-Badge + Popover der Beleg-
  // Karte brauchen ALLE Meldungen inkl. Einzel-Status + Instruktion.
  issues: {
    orderBy: { reportedAt: 'asc' as const },
    include: {
      messages: true,
      // Standardanweisung der Problemart (Vorlage für den TL-Dialog).
      reason: { select: { defaultInstruction: true, autoInsert: true } },
    },
  },
  // Die Bündel-Reihenfolge der Engine plus die Pack-Zugehörigkeit (sie
  // entscheidet, was der MA überhaupt sieht). Prisma kann nicht über eine
  // To-many-Relation sortieren — deshalb unten in JS.
  assignmentItems: { select: { sequence: true, packIndex: true } },
  // Geteilter Beleg: Beteiligte chronologisch, für CaseSummaryDto.collaboration.
  participants: {
    orderBy: { invitedAt: 'asc' as const },
    include: { employee: { select: { employeeNo: true, displayName: true } } },
  },
} satisfies Prisma.GoodsReceiptCaseInclude;

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
    private readonly clock: ClockService,
  ) {}

  private async resolveEmployee(
    principal: Principal,
  ): Promise<{ id: string; employeeNo: string; displayName: string }> {
    if (!principal.employeeNo) {
      throw new ForbiddenException('Token has no employee number claim');
    }
    const user = await this.prisma.user.findUnique({
      where: { employeeNo: principal.employeeNo },
      select: { id: true, employeeNo: true, displayName: true, active: true },
    });
    if (!user || !user.active) {
      throw new ForbiddenException('Employee not provisioned or inactive');
    }
    return { id: user.id, employeeNo: user.employeeNo, displayName: user.displayName };
  }

  async getToday(principal: Principal): Promise<TodayResponseDto> {
    const employee = await this.resolveEmployee(principal);
    const today = startOfDayUtc(await this.clock.now());

    // Bevorzugt das OFFENE Bündel des Tages (Ein-offenes-Bündel-Invariante):
    // Altdaten mit mehreren Tages-Bündeln zeigten sonst das neueste statt des
    // offenen — und die Problem-Belege samt TL-Instruktionen verschwanden beim
    // MA. Fallback aufs neueste Bündel = Feierabend-Sicht (alles abgeschlossen).
    const openBundleRef = await this.prisma.assignmentBundle.findFirst({
      where: {
        employeeId: employee.id,
        date: today,
        status: { notIn: ['completed', 'cancelled'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const bundle = await this.prisma.assignmentBundle.findFirst({
      where: openBundleRef ? { id: openBundleRef.id } : { employeeId: employee.id, date: today },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { displayName: true } },
        routeStops: { orderBy: { sequence: 'asc' } },
        cases: { include: TODAY_CASE_INCLUDE },
      },
    });

    const workstation = await this.getMyWorkstation(employee.id);

    // „Geteilt mit dir" (Konzept §3.5): Belege, an denen ich aktiver HELFER bin
    // (angenommen|teil_erledigt). Sie liegen im Karren des Inhabers — nie im
    // eigenen Bündel — und erscheinen deshalb auch OHNE eigenes Bündel; fertige
    // fallen heraus. Ohne carriedOver/packOrdinal: sie gehören keinem Pack an.
    const sharedRows = await this.prisma.goodsReceiptCase.findMany({
      where: {
        status: { notIn: [...TERMINAL_CASE_STATUSES] },
        participants: {
          some: {
            employeeId: employee.id,
            role: 'helfer',
            status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
          },
        },
      },
      include: {
        ...TODAY_CASE_INCLUDE,
        assignedBundle: { select: { employee: { select: { displayName: true } } } },
      },
      orderBy: { weBelegNo: 'asc' },
    });
    const sharedCases = sharedRows.map((c) => ({
      ...this.mapSummary(
        c,
        c.assignedBundle?.employee?.displayName ?? null,
        c.issues.length > 0 ? c.issues.map((i) => mapIssueSummary(i, c.positions)) : undefined,
        toCollaborationDto(c.participants, c.positions),
      ),
      // Ware holen ist ein eigener Gang (01.09.2026): hier zählt MEIN Haken aus
      // der Beteiligung, nicht der des Inhabers am Beleg — sonst wäre der Beleg
      // für mich schon geholt, sobald der Inhaber ihn abgehakt hat.
      collected: c.participants.find((p) => p.employeeId === employee.id)?.collectedAt != null,
    }));

    if (!bundle) {
      return { date: isoDay(today), bundle: null, pack: null, cases: [], sharedCases, workstation };
    }

    // Pull-Prinzip (single source: `pack-window.ts`): der MA sieht ausschließlich
    // sein AKTIVES Pack. Vorgeplante Folge-Packs bleiben komplett verborgen —
    // sonst zöge er Arbeit vor, die er noch gar nicht angefordert hat. Dazu die
    // Anzeige-Mitnahme: noch offene Belege früherer Packs (Problemfälle, die er
    // beim Wechsel nicht abschließen konnte) bleiben sichtbar, bis sie fertig
    // sind. Ihr `packIndex` bleibt unangetastet — sie zählen weiter aufs alte Pack.
    const packItems: PackItem[] = bundle.cases.map((c) => ({
      caseId: c.id,
      packIndex: c.assignmentItems[0]?.packIndex ?? 0,
      status: c.status,
    }));
    const window = packWindow(packItems, bundle.activePackIndex);
    const visible = new Set([...window.activeCaseIds, ...window.carriedOverCaseIds]);
    const carriedOverIds = new Set(window.carriedOverCaseIds);
    const packIndexByCase = new Map(packItems.map((i) => [i.caseId, i.packIndex]));

    const assignedEmployeeName = bundle.employee.displayName;
    return {
      date: isoDay(today),
      bundle: this.mapBundle(bundle),
      pack: {
        // Anzeige-Position statt persistiertem packIndex: Indizes können Lücken
        // haben (leergelaufene bzw. von der Automatik abgeräumte Packs) — die App
        // soll „Pack 2 von 2" sagen, nie „Pack 3 von 2".
        index: packOrdinal(packItems, bundle.activePackIndex) - 1,
        total: packCount(packItems),
        caseCount: window.activeCaseIds.length,
      },
      cases: [...bundle.cases]
        .filter((c) => visible.has(c.id))
        .sort(byBundleSequence)
        .map((c) => ({
          ...this.mapSummary(
            c,
            assignedEmployeeName,
            c.issues.length > 0 ? c.issues.map((i) => mapIssueSummary(i, c.positions)) : undefined,
            toCollaborationDto(c.participants, c.positions),
          ),
          carriedOver: carriedOverIds.has(c.id),
          // Lücken-feste Anzeige-Position („aus Pack n") — wie TodayPackDto.index
          // eine reine Darstellungsgröße, NIE der persistierte packIndex.
          packOrdinal: packOrdinal(packItems, packIndexByCase.get(c.id) ?? bundle.activePackIndex),
        })),
      sharedCases,
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
          // Zurück in den Pool ⇒ nicht mehr auf einem Karren: der Ware-holen-
          // Haken (collectedAt) wird mit gelöscht.
          data: {
            status: 'ready',
            assignedBundleId: null,
            collectedAt: null,
            version: { increment: 1 },
          },
        });
        // Ende der Zusammenarbeit (§5.5): der Beleg verlässt den Karren des
        // Inhabers — Beteiligungen auflösen; geprüfte Positionen bleiben geprüft.
        await dissolveCollaborationTx(tx, caseId, this.events, {
          actorType: 'employee',
          actorId: principal.sub,
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

  /**
   * Ware-holen-Haken (B2): persistiert, ob die Ware am Lagerplatz geholt ist.
   * Tipp in der Liste UND Scanner-Auto-Abhaken (Lagerplatz-Scan) laufen beide
   * über diesen einen Weg, damit der Zustand Reload und Gerätewechsel überlebt.
   * Toggle: `collected=false` entfernt den Haken wieder. Bewusst KEIN
   * Status-Übergang und KEIN Versions-Inkrement — der Haken ist orthogonaler
   * Arbeitszustand, keine Lifecycle-Transition.
   *
   * JE PERSON EIN HAKEN (Kundenwunsch 01.09.2026): Beim geteilten Beleg holt
   * auch der eingeladene Helfer die Ware bzw. seinen Teil davon. Der Inhaber
   * hakt den Beleg ab (`GoodsReceiptCase.collectedAt` — der Beleg liegt auf
   * SEINEM Karren), jeder aktive Helfer seinen eigenen Gang
   * (`CaseParticipant.collectedAt`). Ein gemeinsamer Haken hätte für alle
   * gegolten, sobald einer ihn setzt — die anderen stünden ohne Ware da.
   */
  async setCollected(
    principal: Principal,
    caseId: string,
    dto: SetCollectedDto,
  ): Promise<SetCollectedResultDto> {
    const found = await this.requireWorkableCase(principal, caseId);
    const istInhaber = found.ownerEmployeeNo === principal.employeeNo;
    const employee = istInhaber ? null : await this.resolveEmployee(principal);
    const collectedAt = dto.collected ? await this.clock.now() : null;

    await this.prisma.$transaction(async (tx) => {
      if (istInhaber) {
        await tx.goodsReceiptCase.update({ where: { id: found.id }, data: { collectedAt } });
      } else {
        // `updateMany` mit Status-Vorbedingung: wurde die Beteiligung im selben
        // Moment beendet, läuft der Haken ins Leere statt eine tote Zeile zu
        // beschreiben.
        const hit = await tx.caseParticipant.updateMany({
          where: {
            caseId: found.id,
            employeeId: employee!.id,
            status: { in: [...ACTIVE_PARTICIPANT_STATUSES] },
          },
          data: { collectedAt },
        });
        if (hit.count === 0) {
          throw new NotFoundException(`Case ${caseId} not found`);
        }
      }
      await this.events.append(
        {
          eventType: 'case.collected',
          entityType: 'GoodsReceiptCase',
          entityId: found.id,
          actorType: 'employee',
          actorId: principal.sub,
          payload: { collected: dto.collected, rolle: istInhaber ? 'inhaber' : 'helfer' },
        },
        tx,
      );
    });
    return { caseId: found.id, collected: dto.collected };
  }

  /**
   * Sperrt die Case-Zeile FOR SHARE und prüft dabei `in_progress` — im selben
   * Statement, damit die Bedingung beim Warten auf eine laufende Abschluss-
   * Transition (exklusives Zeilen-Lock) NEU ausgewertet wird: committet der
   * Abschluss zuerst, endet der Arbeitsstand-Schreiber hier als 409, statt auf
   * einem fertigen Beleg zu landen. Umgekehrt hält das Share-Lock die
   * Transition auf, bis dieser Schreiber committet ist — ihr In-Tx-Gate (§5.2)
   * sieht den Haken dann. FOR SHARE statt FOR UPDATE, damit mehrere Beteiligte
   * gleichzeitig haken und zählen können.
   */
  private async lockCaseInProgressTx(
    tx: Prisma.TransactionClient,
    caseId: string,
    conflictMessage: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM goods_receipt_cases WHERE id = ${caseId} AND status = 'in_progress' FOR SHARE`;
    if (rows.length === 0) {
      throw new ConflictException(conflictMessage);
    }
  }

  /**
   * „Position geprüft" (Konzept §2/§7): der Haken lebt seit 31.08.2026
   * serverseitig — wer hat welche Position wann geprüft. Gemeinsame Wahrheit für
   * ALLE Belege, nicht nur geteilte. Wie der Ware-holen-Haken bewusst OHNE
   * Status-Übergang und OHNE Versions-Inkrement (orthogonaler Arbeitszustand);
   * `status` der Position wird dabei confirmed/open (Konzept §6).
   */
  async confirmPosition(
    principal: Principal,
    caseId: string,
    positionId: string,
    dto: ConfirmPositionDto,
  ): Promise<PositionConfirmResultDto> {
    const owned = await this.requireWorkableCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    if (owned.status !== 'in_progress') {
      throw new ConflictException(
        'Positionen lassen sich nur prüfen, während der Beleg in Bearbeitung ist',
      );
    }
    const position = await this.prisma.receiptPosition.findFirst({
      where: { id: positionId, caseId: owned.id },
      select: { id: true, positionNo: true },
    });
    if (!position) {
      throw new NotFoundException(`Position ${positionId} gehört nicht zu Beleg ${caseId}`);
    }
    const now = await this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await this.lockCaseInProgressTx(
        tx,
        owned.id,
        'Positionen lassen sich nur prüfen, während der Beleg in Bearbeitung ist',
      );
      await tx.receiptPosition.update({
        where: { id: position.id },
        data: dto.confirmed
          ? { confirmedAt: now, confirmedById: employee.id, status: 'confirmed' }
          : { confirmedAt: null, confirmedById: null, status: 'open' },
      });
      await this.events.append(
        {
          eventType: 'position.confirmed',
          entityType: 'GoodsReceiptCase',
          entityId: owned.id,
          actorType: 'employee',
          actorId: principal.sub,
          payload: {
            positionId: position.id,
            positionNo: position.positionNo,
            confirmed: dto.confirmed,
            employeeNo: employee.employeeNo,
          },
        },
        tx,
      );
    });
    // Live an Inhaber + aktive Beteiligte (§8): die Team-Ansicht lässt das
    // Kästchen des Handelnden aufleuchten und lädt den Aggregat-Stand nach.
    this.live.publish({
      type: 'position.confirmed',
      recipients: await recipientsForCase(this.prisma, owned.id),
      caseId: owned.id,
      status: null,
      actorEmployeeNo: employee.employeeNo,
      positionId: position.id,
      at: now.toISOString(),
    });
    return {
      caseId: owned.id,
      positionId: position.id,
      confirmed: dto.confirmed,
      confirmedBy: dto.confirmed
        ? { employeeNo: employee.employeeNo, displayName: employee.displayName }
        : null,
      confirmedAt: dto.confirmed ? now.toISOString() : null,
    };
  }

  /**
   * Ist-Menge/Preiskorrektur je Größenzeile erfassen (Konzept §2/§7) — pro
   * Aktion persistiert, damit alle Beteiligten denselben Stand sehen (bisher
   * reiner Client-Zustand, ging beim Neuladen verloren). `null` setzt den
   * jeweiligen Wert zurück. Kein Versions-Inkrement (Muster Ware-holen-Haken).
   */
  async countSkuLine(
    principal: Principal,
    caseId: string,
    skuLineId: string,
    dto: CountSkuLineDto,
  ): Promise<SkuCountResultDto> {
    const owned = await this.requireWorkableCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    if (owned.status !== 'in_progress') {
      throw new ConflictException(
        'Mengen lassen sich nur erfassen, während der Beleg in Bearbeitung ist',
      );
    }
    if (dto.confirmedQuantity === undefined && dto.correctedVkPrice === undefined) {
      throw new BadRequestException(
        'Keine Änderung übergeben – confirmedQuantity oder correctedVkPrice angeben',
      );
    }
    const line = await this.prisma.receiptSkuLine.findFirst({
      where: { id: skuLineId, position: { caseId: owned.id } },
      select: {
        id: true,
        expectedQuantity: true,
        confirmedQuantity: true,
        correctedVkPrice: true,
        receiptPositionId: true,
      },
    });
    if (!line) {
      throw new NotFoundException(`Größenzeile ${skuLineId} gehört nicht zu Beleg ${caseId}`);
    }
    // Teil-Update: Feld nicht im Body ⇒ persistierten Stand (anderer Beteiligter)
    // unangetastet lassen; explizites null setzt den Wert zurück.
    const confirmedQuantity =
      dto.confirmedQuantity !== undefined ? dto.confirmedQuantity : line.confirmedQuantity;
    const correctedVkPrice =
      dto.correctedVkPrice !== undefined ? dto.correctedVkPrice : line.correctedVkPrice;
    const status =
      confirmedQuantity === null
        ? 'open'
        : confirmedQuantity === line.expectedQuantity
          ? 'confirmed'
          : 'deviation';
    const now = await this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await this.lockCaseInProgressTx(
        tx,
        owned.id,
        'Mengen lassen sich nur erfassen, während der Beleg in Bearbeitung ist',
      );
      await tx.receiptSkuLine.update({
        where: { id: line.id },
        data: { confirmedQuantity, correctedVkPrice, status },
      });
      await this.events.append(
        {
          eventType: 'sku.quantity_confirmed',
          entityType: 'GoodsReceiptCase',
          entityId: owned.id,
          actorType: 'employee',
          actorId: principal.sub,
          payload: {
            skuLineId: line.id,
            confirmedQuantity,
            correctedVkPrice,
            employeeNo: employee.employeeNo,
          },
        },
        tx,
      );
    });
    this.live.publish({
      type: 'sku.counted',
      recipients: await recipientsForCase(this.prisma, owned.id),
      caseId: owned.id,
      status: null,
      actorEmployeeNo: employee.employeeNo,
      positionId: line.receiptPositionId,
      at: now.toISOString(),
    });
    return {
      caseId: owned.id,
      skuLineId: line.id,
      confirmedQuantity,
      correctedVkPrice: correctedVkPrice ?? null,
      status,
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
        positions: {
          include: {
            instruction: true,
            skuLines: { orderBy: { ean: 'asc' } },
            // „Position geprüft": wer geprüft hat (Initialen-Chip, Konzept §3.6).
            confirmedBy: { select: { employeeNo: true, displayName: true } },
          },
          orderBy: { positionNo: 'asc' },
        },
        transportBoxes: { orderBy: { boxNo: 'asc' } },
        assignedBundle: {
          select: { employee: { select: { employeeNo: true, displayName: true } } },
        },
        // Geteilter Beleg: Beteiligte für den Zugriff (§5.1) + collaboration-Projektion.
        participants: {
          orderBy: { invitedAt: 'asc' },
          include: { employee: { select: { employeeNo: true, displayName: true } } },
        },
        // Instruktions-Loop (04.08.2026): Meldungen inkl. Verlauf — die PWA zeigt
        // die TL-Hinweis-Blöcke an der betroffenen Position (positionId-Anker).
        issues: {
          orderBy: { reportedAt: 'asc' },
          include: {
            messages: true,
            reason: { select: { defaultInstruction: true, autoInsert: true } },
          },
        },
      },
    });
    if (!found) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    const ownerEmployeeNo = found.assignedBundle?.employee?.employeeNo ?? null;
    // §5.1: sehen darf der Inhaber ODER ein AKTIVER Beteiligter — Eingeladene nicht.
    const activeParticipantNos = found.participants
      .filter((p) => (ACTIVE_PARTICIPANT_STATUSES as readonly string[]).includes(p.status))
      .map((p) => p.employee.employeeNo);
    if (!canAccessCase(principal, ownerEmployeeNo, activeParticipantNos)) {
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
      list.push({
        preferredSize: pref.preferredSize,
        alternativeSize: pref.alternativeSize ?? undefined,
      });
      prefsByWgr.set(pref.wgr, list);
    }

    const issues = found.issues.map((i) => mapIssueSummary(i, found.positions));
    return {
      case: this.mapSummary(
        found,
        found.assignedBundle?.employee?.displayName ?? null,
        issues,
        toCollaborationDto(found.participants, found.positions),
      ),
      workInstruction: found.workInstruction ? mapWorkInstruction(found.workInstruction) : null,
      positions: found.positions.map((p) => this.mapPosition(p, prefsByWgr)),
      boxTargets: found.transportBoxes.map((b) => mapBoxTarget(b)),
      instructionPoints,
      issues,
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
      confirmedAt?: Date | null;
      confirmedBy?: { employeeNo: string; displayName: string } | null;
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
      confirmedBy: p.confirmedBy ?? null,
      confirmedAt: p.confirmedAt ? p.confirmedAt.toISOString() : null,
      instruction: p.instruction ? mapPositionInstruction(p.instruction) : null,
      skuLines: p.skuLines.map((s) => mapSkuLine(s, marks[s.size] ?? null)),
    };
  }

  async startPreparation(principal: Principal, caseId: string): Promise<TransitionResultDto> {
    const owned = await this.requireWorkableCase(principal, caseId);
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

  async complete(
    principal: Principal,
    caseId: string,
    dto: CompleteDto = {},
  ): Promise<TransitionResultDto> {
    const owned = await this.requireWorkableCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    const caseRow = await this.prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: owned.id },
      select: { totalQuantity: true, effortPoints: true },
    });
    // Punkt 7 (Kundenfeedback 14.07.2026): Mehr-/Minderlieferung oder Preis-
    // abweichung ist AUTOMATISCH ein Problem und erzwingt den Teilabschluss —
    // „Beleg erledigt" (voll) ist dann nicht erlaubt. Grundlage sind die
    // GEMISCHTEN Sku-Stände (Body ∪ persistierter Zähl-Stand, Konzept §7);
    // bereits als Meldung erfasste Abweichungen (Problem-Loop) blockieren den
    // Abschluss nicht ein zweites Mal — sie hängen am Teamlead, nicht am Zähler.
    const { effective, fromBody } = await this.resolveEffectiveSkuStates(
      owned.id,
      dto.skuQuantities ?? [],
    );
    const implicit = await this.withoutReportedProblems(
      owned.id,
      deriveImplicitProblems(effective),
    );
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
    // Fertig-Gate geteilter Belege (§5.2): „Beleg erledigt" erst, wenn ALLE
    // Positionen geprüft sind. Nicht geteilte Belege behalten das Client-Gate.
    const collaborationActive = await isCollaborationActive(this.prisma, owned.id);
    if (collaborationActive) {
      const gateError = completeGateError(await this.gatePositions(owned.id));
      if (gateError !== null) throw new BadRequestException(gateError);
    }
    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'completed',
      eventType: 'case.completed',
      actor: { actorType: 'employee', actorId: principal.sub },
      expectedVersion: owned.version,
      // §5.2-Gate NOCHMAL innerhalb der Transitions-Tx: der Vorab-Check oben
      // liest ohne Lock — nimmt ein Beteiligter GLEICHZEITIG einen Haken
      // zurück, wartet sein FOR-SHARE-Schreiber auf diese Tx (oder umgekehrt)
      // und genau einer von beiden verliert sauber mit 409/400.
      guardInTx: collaborationActive
        ? async (tx) => {
            const gateError = completeGateError(await this.gatePositions(owned.id, tx));
            if (gateError !== null) throw new BadRequestException(gateError);
          }
        : undefined,
    });
    await this.persistSkuConfirmations(fromBody);
    // §17.1 ZST: digital completion produces the ZST record + KPI basis — je
    // Größenzeile die erfasste Menge, sonst Soll (Konzept §5.3).
    const completedQuantity =
      effective.length > 0
        ? effective.reduce((sum, s) => sum + s.confirmedQuantity, 0)
        : caseRow.totalQuantity;
    await this.writeZstForCompletion(principal, owned.id, employee.id, collaborationActive, {
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
    const owned = await this.requireWorkableCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    const caseRow = await this.prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: owned.id },
      select: { totalQuantity: true, effortPoints: true },
    });
    // Gemischte Sku-Stände (Konzept §7): Body-Zeilen ∪ persistierter Zähl-Stand.
    const { effective, fromBody } = await this.resolveEffectiveSkuStates(
      owned.id,
      dto.skuQuantities,
    );
    const implicitAll = deriveImplicitProblems(effective);
    // Bereits gemeldete Abweichungen (gleiche Größenzeile + Art) werden nicht
    // erneut angelegt — der Problem-Loop kennt sie schon; sonst erzeugte jeder
    // weitere Teilabschluss Duplikate derselben Meldung.
    const implicit = await this.withoutReportedProblems(owned.id, implicitAll);
    const manual = await this.validateManualProblems(owned.id, dto.problems);
    if (implicit.length === 0 && manual.length === 0) {
      throw new BadRequestException(
        implicitAll.length > 0
          ? 'Diese Abweichungen sind bereits gemeldet – über „Erneut melden" antworten oder den Beleg abschließen'
          : 'Teilabschluss braucht mindestens ein Problem – sonst „Beleg erledigt" verwenden',
      );
    }
    // Fertig-Gate geteilter Belege (§5.2): jede UNGEPRÜFTE Position muss eine
    // Problem-Position sein — offene Meldung, manuelle Meldung dieses Bodys oder
    // implizite Abweichung auf einer ihrer Größenzeilen.
    const collaborationActive = await isCollaborationActive(this.prisma, owned.id);
    const problemPositionIds = collaborationActive
      ? new Set<string>([
          ...manual.map((p) => p.positionId),
          ...implicitAll.map((p) => p.positionId),
          ...(await this.openIssuePositionIds(owned.id)),
        ])
      : new Set<string>();
    if (collaborationActive) {
      const gateError = partialGateError(await this.gatePositions(owned.id), problemPositionIds);
      if (gateError !== null) throw new BadRequestException(gateError);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      // Jede Meldung startet ihren eigenen Instruktions-Verlauf: die Erst-Meldung
      // des MA ist der erste Eintrag (Kundenfeedback 04.08.2026).
      const meldung = (issueId: string, text: string) =>
        tx.issueMessage.create({
          data: {
            issueId,
            authorId: employee.id,
            authorName: employee.displayName,
            authorRole: 'employee',
            kind: 'meldung',
            text,
          },
        });
      for (const p of manual) {
        const issue = await tx.issue.create({
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
        await meldung(issue.id, p.note?.trim() ? p.note : (p.reasonLabel ?? 'Problem gemeldet'));
      }
      for (const p of implicit) {
        const issue = await tx.issue.create({
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
        await meldung(issue.id, describeImplicitProblem(p));
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
        // §5.2-Gate NOCHMAL innerhalb der Transitions-Tx (Spiegel von complete):
        // die Problem-Positionen stammen aus dem Vorab-Read dieses Requests,
        // die Haken werden unter dem exklusiven Case-Lock frisch gelesen.
        guardInTx: collaborationActive
          ? async (guardTx) => {
              const gateError = partialGateError(
                await this.gatePositions(owned.id, guardTx),
                problemPositionIds,
              );
              if (gateError !== null) throw new BadRequestException(gateError);
            }
          : undefined,
      });
    });
    await this.persistSkuConfirmations(fromBody);
    // Partial ZST: prorate the effort by the completed share (§4.6, §15) — bei
    // aktiver Zusammenarbeit je Beteiligtem, was ER geprüft hat (§5.3).
    const completedQuantity = effective.reduce((sum, s) => sum + s.confirmedQuantity, 0);
    await this.writeZstForCompletion(principal, owned.id, employee.id, collaborationActive, {
      countedQuantity: completedQuantity,
      caseTotalQuantity: caseRow.totalQuantity,
      caseEffortPoints: caseRow.effortPoints,
    });
    return this.finish(principal, result);
  }

  /**
   * Rückmeldung auf eine Instruktion (Kundenfeedback 04.08.2026): der MA reagiert
   * am KONKRETEN Problem („Erneut melden / Rückfrage", Pflichttext) — kein freies
   * Chatten. Die Meldung geht zurück auf `open`; der Beleg fällt in den Problem-
   * Status zurück (problem_resolved/in_progress → issue_open) und erscheint
   * wieder in der Probleme-Lane des Teamleads.
   */
  async reopenIssue(
    principal: Principal,
    caseId: string,
    issueId: string,
    dto: ReopenIssueDto,
  ): Promise<TransitionResultDto> {
    const owned = await this.requireWorkableCase(principal, caseId);
    const employee = await this.resolveEmployee(principal);
    const issue = await this.prisma.issue.findFirst({
      where: { id: issueId, caseId: owned.id },
      select: { id: true, status: true },
    });
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found on case ${caseId}`);
    if (issue.status !== 'instruction_sent') {
      throw new ConflictException('Nur eine instruierte Meldung kann erneut gemeldet werden');
    }
    if (!['issue_open', 'problem_resolved', 'in_progress'].includes(owned.status)) {
      throw new ConflictException(`Rückmeldung ist im Status ${owned.status} nicht möglich`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.issueMessage.create({
        data: {
          issueId: issue.id,
          authorId: employee.id,
          authorName: employee.displayName,
          authorRole: 'employee',
          kind: 'rueckmeldung',
          text: dto.text,
        },
      });
      await tx.issue.update({ where: { id: issue.id }, data: { status: 'open' } });
      await this.events.append(
        {
          eventType: 'issue.reopened',
          entityType: 'Issue',
          entityId: issue.id,
          actorType: 'employee',
          actorId: principal.sub,
          payload: { caseId: owned.id, text: dto.text },
        },
        tx,
      );
    });

    if (owned.status === 'issue_open') {
      // Teilzustand: der Beleg ist ohnehin im Problem-Status — nur live nachladen.
      this.live.publish({
        type: 'case.status',
        recipients: await recipientsForCase(this.prisma, owned.id),
        caseId: owned.id,
        status: owned.status,
        actorEmployeeNo: principal.employeeNo ?? null,
        positionId: null,
        at: (await this.clock.now()).toISOString(),
      });
      return { caseId: owned.id, status: owned.status, version: owned.version, eventId: null };
    }

    const result = await this.workflow.transition({
      caseId: owned.id,
      toStatus: 'issue_open',
      eventType: 'case.problem_reopened',
      actor: { actorType: 'employee', actorId: principal.sub },
      payload: { issueId: issue.id },
      expectedVersion: owned.version,
    });
    return this.finish(principal, result);
  }

  /**
   * Gemischte Sku-Stände für Abschluss/Teilabschluss (Konzept §7): ALLE
   * Größenzeilen des Belegs — je Zeile zählt der Body-Wert (wenn enthalten),
   * sonst der persistierte Zähl-Stand (`confirmedQuantity ?? Soll`,
   * `correctedVkPrice`). Unbekannte skuLineIds im Body sind ein Client-Fehler.
   */
  private async resolveEffectiveSkuStates(
    caseId: string,
    skuQuantities: SkuQuantityDto[],
  ): Promise<{ effective: EffectiveSkuState[]; fromBody: EffectiveSkuState[] }> {
    const lines = await this.prisma.receiptSkuLine.findMany({
      where: { position: { caseId } },
      select: {
        id: true,
        expectedQuantity: true,
        confirmedQuantity: true,
        correctedVkPrice: true,
        vkLabelPrice: true,
        receiptPositionId: true,
      },
    });
    const known = new Set(lines.map((l) => l.id));
    for (const q of skuQuantities) {
      if (!known.has(q.skuLineId)) {
        throw new BadRequestException(`Größenzeile ${q.skuLineId} gehört nicht zu diesem Beleg`);
      }
    }
    const bodyById = new Map(skuQuantities.map((q) => [q.skuLineId, q]));
    const effective = lines.map((line): EffectiveSkuState => {
      const body = bodyById.get(line.id);
      if (body === undefined) {
        return {
          skuLineId: line.id,
          positionId: line.receiptPositionId,
          expectedQuantity: line.expectedQuantity,
          confirmedQuantity: line.confirmedQuantity ?? line.expectedQuantity,
          vkLabelPrice: line.vkLabelPrice,
          correctedVkPrice: line.correctedVkPrice,
          fromBody: false,
          correctedVkPriceTouched: false,
        };
      }
      const correctedVkPriceTouched = body.correctedVkPrice !== undefined;
      return {
        skuLineId: line.id,
        positionId: line.receiptPositionId,
        expectedQuantity: line.expectedQuantity,
        confirmedQuantity: body.confirmedQuantity,
        vkLabelPrice: line.vkLabelPrice,
        correctedVkPrice: correctedVkPriceTouched
          ? (body.correctedVkPrice ?? null)
          : line.correctedVkPrice,
        fromBody: true,
        correctedVkPriceTouched,
      };
    });
    return { effective, fromBody: effective.filter((s) => s.fromBody) };
  }

  /**
   * Filtert implizite Probleme heraus, für die am Beleg bereits eine Meldung
   * derselben Art auf derselben Größenzeile existiert (offen ODER instruiert):
   * der Problem-Loop kennt sie — eine persistierte Preiskorrektur darf den
   * späteren Abschluss nicht für immer blockieren, und wiederholte
   * Teilabschlüsse dürfen keine Duplikate anlegen.
   */
  private async withoutReportedProblems(
    caseId: string,
    problems: ImplicitProblem[],
  ): Promise<ImplicitProblem[]> {
    if (problems.length === 0) return [];
    const existing = await this.prisma.issue.findMany({
      where: {
        caseId,
        scope: 'sku_line',
        kind: { in: ['over_delivery', 'under_delivery', 'price_deviation'] },
      },
      select: { scopeId: true, kind: true },
    });
    const reported = new Set(existing.map((i) => `${i.kind}:${i.scopeId ?? ''}`));
    return problems.filter((p) => !reported.has(`${p.kind}:${p.skuLineId}`));
  }

  /**
   * Positions-Ausschnitt fürs Fertig-Gate geteilter Belege (§5.2). `db` erlaubt
   * die Neu-Auswertung INNERHALB der Transitions-Tx (guardInTx): dort ist die
   * Case-Zeile exklusiv gesperrt und kein Haken-Schreiber mehr unterwegs.
   */
  private async gatePositions(
    caseId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<GatePosition[]> {
    const rows = await db.receiptPosition.findMany({
      where: { caseId },
      orderBy: { positionNo: 'asc' },
      select: { id: true, positionNo: true, confirmedById: true },
    });
    return rows.map((r) => ({
      positionId: r.id,
      positionNo: r.positionNo,
      confirmedById: r.confirmedById,
    }));
  }

  /**
   * Positionen mit OFFENER Meldung (scope position/sku_line, §5.2), aufgelöst
   * auf die Positions-Id — Größenzeilen-Meldungen zählen auf ihre Position.
   */
  private async openIssuePositionIds(caseId: string): Promise<string[]> {
    const issues = await this.prisma.issue.findMany({
      where: { caseId, status: 'open', scope: { in: ['position', 'sku_line'] } },
      select: { scope: true, scopeId: true },
    });
    if (issues.length === 0) return [];
    const skuLineIds = issues
      .filter((i) => i.scope === 'sku_line' && i.scopeId !== null)
      .map((i) => i.scopeId as string);
    const lines =
      skuLineIds.length > 0
        ? await this.prisma.receiptSkuLine.findMany({
            where: { id: { in: skuLineIds } },
            select: { id: true, receiptPositionId: true },
          })
        : [];
    const positionByLine = new Map(lines.map((l) => [l.id, l.receiptPositionId]));
    return issues
      .map((i) => (i.scope === 'position' ? i.scopeId : positionByLine.get(i.scopeId ?? '')))
      .filter((id): id is string => id != null);
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

  /**
   * Persists the counted Ist per TOUCHED SKU line (`deviation` when Ist≠Soll).
   * Die Preiskorrektur wird nur geschrieben, wenn der Body sie explizit trug —
   * sonst bleibt der über den Zähl-Endpunkt persistierte Stand unangetastet.
   */
  private async persistSkuConfirmations(skuStates: EffectiveSkuState[]): Promise<void> {
    if (skuStates.length === 0) return;
    await this.prisma.$transaction(
      skuStates.map((s) =>
        this.prisma.receiptSkuLine.update({
          where: { id: s.skuLineId },
          data: {
            confirmedQuantity: s.confirmedQuantity,
            status: s.confirmedQuantity === s.expectedQuantity ? 'confirmed' : 'deviation',
            ...(s.correctedVkPriceTouched ? { correctedVkPrice: s.correctedVkPrice ?? null } : {}),
          },
        }),
      ),
    );
  }

  /**
   * ZST beim Abschluss/Teilabschluss (Konzept §5.3): ohne aktive Zusammenarbeit
   * bekommt wie bisher der Abschließende die gesamte gezählte Menge; bei
   * aktiver Zusammenarbeit wird je Beteiligtem gebucht, was ER geprüft hat —
   * Summe der Ist-Mengen (erfasste Menge, sonst Soll) über die Positionen mit
   * seiner `confirmedById`. Positionen ohne Prüfer bucht niemand; „Teilbeleg
   * erledigt" bucht nichts.
   */
  private async writeZstForCompletion(
    principal: Principal,
    caseId: string,
    completingEmployeeId: string,
    collaborationActive: boolean,
    zst: { countedQuantity: number; caseTotalQuantity: number; caseEffortPoints: number },
  ): Promise<void> {
    if (!collaborationActive) {
      await this.writeZst(principal, caseId, completingEmployeeId, {
        ...zst,
        caseCountedTotal: zst.countedQuantity,
      });
      return;
    }
    const positions = await this.prisma.receiptPosition.findMany({
      where: { caseId, confirmedById: { not: null } },
      select: {
        confirmedById: true,
        skuLines: { select: { expectedQuantity: true, confirmedQuantity: true } },
      },
    });
    const countedByEmployee = new Map<string, number>();
    for (const position of positions) {
      const employeeId = position.confirmedById;
      if (employeeId === null) continue;
      const quantity = position.skuLines.reduce(
        (sum, line) => sum + (line.confirmedQuantity ?? line.expectedQuantity),
        0,
      );
      countedByEmployee.set(employeeId, (countedByEmployee.get(employeeId) ?? 0) + quantity);
    }
    for (const [employeeId, countedQuantity] of countedByEmployee) {
      await this.writeZst(principal, caseId, employeeId, {
        ...zst,
        countedQuantity,
        caseCountedTotal: zst.countedQuantity,
      });
    }
  }

  /**
   * Persists the ZST completion record + zst.created audit event (§15.1).
   * Bucht je (Beleg, Mitarbeiter)-Paar nur das DELTA zum bereits verbuchten
   * Stand: nach einem Teilabschluss (Problem-Loop) zählt der spätere Abschluss
   * desselben Belegs nur die restliche Menge — keine Doppelzählung in der
   * KPI-Basis. Der Mitarbeiter steckt seit der Zusammenarbeit (Konzept §5.3)
   * mit im Schlüssel, damit Beteiligte eines geteilten Belegs unabhängig
   * voneinander buchen. Zusätzlich kappt eine BELEG-weite Aggregation das
   * Delta auf die gezählte Gesamtmenge: wechselt der Buchende zwischen
   * Teilabschluss und Abschluss (Helfer entfernt, Haken neu gesetzt, Beleg
   * verschoben), würde das Paar-Delta dieselben Stücke sonst ein zweites Mal
   * zählen. Idempotent per (case, employee, kumulierte Menge) so a retry does
   * not double-count.
   */
  private async writeZst(
    principal: Principal,
    caseId: string,
    employeeId: string,
    zst: {
      countedQuantity: number;
      caseCountedTotal: number;
      caseTotalQuantity: number;
      caseEffortPoints: number;
    },
  ): Promise<void> {
    const idempotencyKey = `zst:${caseId}:${employeeId}:${zst.countedQuantity}`;
    const existing = await this.prisma.zstRecord.findUnique({ where: { idempotencyKey } });
    if (existing) return;
    const [bookedPair, bookedCase] = await Promise.all([
      this.prisma.zstRecord.aggregate({
        where: { caseId, employeeId },
        _sum: { completedQuantity: true },
      }),
      this.prisma.zstRecord.aggregate({ where: { caseId }, _sum: { completedQuantity: true } }),
    ]);
    const pairDelta = zst.countedQuantity - (bookedPair._sum.completedQuantity ?? 0);
    const caseCap = zst.caseCountedTotal - (bookedCase._sum.completedQuantity ?? 0);
    const deltaQuantity = Math.min(pairDelta, caseCap);
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
          completedAt: await this.clock.now(),
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

  /**
   * Loads a case and enforces §16.1/§5.1: bearbeiten darf der Inhaber ODER ein
   * AKTIVER Beteiligter des geteilten Belegs (angenommen|teil_erledigt);
   * `ownerOnly` (Ware-holen-Haken) lässt nur den Inhaber durch. Eingeladene
   * sehen nichts; fremde Belege lesen sich als 404 (Maskierung).
   */
  private async requireWorkableCase(
    principal: Principal,
    caseId: string,
    options: { ownerOnly?: boolean } = {},
  ): Promise<CaseOwnership> {
    const found = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        status: true,
        version: true,
        assignedBundle: { select: { employee: { select: { employeeNo: true } } } },
        participants: {
          where: { status: { in: [...ACTIVE_PARTICIPANT_STATUSES] } },
          select: { employee: { select: { employeeNo: true } } },
        },
      },
    });
    if (!found) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    const ownerEmployeeNo = found.assignedBundle?.employee?.employeeNo ?? null;
    const participantEmployeeNos = found.participants.map((p) => p.employee.employeeNo);
    try {
      assertCanAccessCase(
        principal,
        caseId,
        ownerEmployeeNo,
        options.ownerOnly === true ? [] : participantEmployeeNos,
      );
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
      participantEmployeeNos,
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
      primaryShopAreaNo?: string | null;
      inboundCartonCount?: number | null;
      missingFields?: string[];
      branchNo: string;
      collectedAt: Date | null;
      docuWareUrl: string | null;
      completedAt: Date | null;
      attentionFlag: boolean;
      attentionNote: string | null;
      forwardedTo: string | null;
      workInstruction?: { priceLabelPrintRequired: boolean; boxLabelRequired: boolean } | null;
      catManDate: Date | null;
      positions?: Array<{
        shopNo: string;
        catManDate: Date | null;
        positionNo?: number;
        supplierArticleNo?: string;
        supplierColor?: string;
        instruction?: { labelPrintVariant: LabelPrintVariant } | null;
      }>;
    },
    assignedEmployeeName: string | null,
    issues?: IssueSummaryDto[],
    collaboration?: CaseCollaborationDto | null,
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
      labelPrintPositions: mapLabelPrintPositions(c.positions),
      collected: c.collectedAt != null,
      primaryShopNo: c.primaryShopNo ?? null,
      primaryShopAreaNo: c.primaryShopAreaNo ?? null,
      inboundCartonCount: c.inboundCartonCount ?? null,
      missingFields: c.missingFields ?? [],
      bookingDate: isoDay(c.bookingDate),
      // Frühester CatMan-Termin (Kopf + Positionen) — der Beleg-Kopf allein
      // trägt ihn nur im Seed-/Manuell-Pfad, aus ProHandel kommt er je Position.
      catManDate: earliestCatManDate(c.catManDate, c.positions ?? []),
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
      ...(issues !== undefined ? { issues } : {}),
      // Geteilter Beleg (nur Mitarbeiter-Sichten): null = nie geteilt.
      ...(collaboration !== undefined ? { collaboration } : {}),
    };
  }

  /**
   * Maps the transition result and broadcasts it on the live stream. Empfänger:
   * Inhaber + aktive Beteiligte des Belegs (Konzept §8) — der Teamlead-Stream
   * erhält ohnehin alles.
   */
  private async finish(
    principal: Principal,
    result: { caseId: string; status: string; version: number; event: { id: string } | null },
  ): Promise<TransitionResultDto> {
    this.live.publish({
      type: 'case.status',
      recipients: await recipientsForCase(this.prisma, result.caseId),
      caseId: result.caseId,
      status: result.status,
      actorEmployeeNo: principal.employeeNo ?? null,
      positionId: null,
      at: (await this.clock.now()).toISOString(),
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
