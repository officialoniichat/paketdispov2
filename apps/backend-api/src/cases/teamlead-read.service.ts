import { Injectable, NotFoundException } from '@nestjs/common';
import type { AssignmentStatus, CaseStatus, LocationKind, PriorityFlag, Prisma } from '@prisma/client';
import {
  detectDeliveryGroups,
  indexDeliveryGroups,
  type DeliveryGroup,
  type GroupingConfig,
} from '@paket/assignment-engine';
import {
  bereichFromLocationKind,
  locationKindSchema,
  type LabelPrintVariant,
  type RuleConfig,
} from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type AblagenPoolDto,
  type AuditEventDto,
  type BoardDto,
  type BoardRowDto,
  type BundleQueueRefDto,
  type CapacityDto,
  type CaseDetailDto,
  type IssueSummaryDto,
  type CaseLookupResultDto,
  type CaseSearchQueryDto,
  type CaseSearchResultDto,
  type CaseSummaryDto,
  type DashboardDto,
  type DeliveryGroupDetailDto,
  type DeliveryGroupMemberDto,
  type EventQueryDto,
  type KpiDto,
  type PoolItemDto,
  type PoolListDto,
  type PoolQueryDto,
  type PositionDetailDto,
  type SkuLineDto,
} from './cases.dto.js';
import { distinctShopNos, isLabelsRequired, mapDeliveryGroupRef, mapIssueSummary,
  mapWorkInstruction, wgrDescription, type IssuePositionRef,
} from './mappers.js';
import { aggregateKpiTotals } from './kpi-aggregate.js';
import { caseEffortInclude, resolveCaseEffort } from './case-effort.js';
import { assignableSearchWhere, rankCaseSearchCandidates, type CaseSearchCandidate } from './case-search.js';
import { loadRuleConfig } from '../config/rule-config.js';

/** Priority flags counted as an "open prio" case in the dashboard tile. */
const OPEN_PRIORITY_FLAGS: PriorityFlag[] = ['prio', 'catman_due', 'overdue', 'same_day_required'];
/** Case statuses that count as "done" for KPI completion (Anhang A). */
const COMPLETED_STATUSES: CaseStatus[] = ['completed', 'zst_done'];
/** Bundle statuses excluded from planned-effort capacity math. */
const INACTIVE_BUNDLE_STATUSES: AssignmentStatus[] = ['cancelled', 'completed'];

/**
 * Lebenszyklus-Scopes der Belege-Ansicht (A2), server-seitig gemappt: aktiv =
 * alles in Bearbeitung, abgeschlossen = heute fertig (vor ZST-Export), archiv =
 * fertig inkl. ZST (DocuWare-Verweis, A6). Der `topf`-Scope ist status-übergreifend
 * (Aufmerksamkeitsflag ODER blocked/needs_review) und lebt in {@link poolWhere}.
 */
const SCOPE_STATUSES: Record<'aktiv' | 'abgeschlossen' | 'archiv', CaseStatus[]> = {
  aktiv: ['ready', 'parked', 'assigned', 'in_progress', 'issue_open', 'problem_resolved'],
  abgeschlossen: ['completed'],
  archiv: ['completed', 'zst_done'],
};

/**
 * Belege, die in den Digitalen Ablagen (§10.2) leben: der steuerbare Pool —
 * alles, was noch park-/freigebbar/priorisierbar ist. Was die Engine bereits
 * platziert hat (`assigned`) oder ein Mitarbeiter angefangen hat, gehört aufs
 * Mitarbeiterboard, nicht in eine Lane.
 */
const ABLAGEN_STATUSES: CaseStatus[] = ['ready', 'parked', 'issue_open'];

/**
 * Zugehörigkeit zu den Ablagen — die EINZIGE Quelle dieser Regel (früher als
 * `isPoolResident` im Cockpit-Frontend dupliziert). Ein weitergeleiteter Beleg
 * bleibt sichtbar, EGAL welchen Status er hat: Weiterleiten ist status-neutral
 * und die Lane ist die Queue (C5).
 */
const ABLAGEN_WHERE: Prisma.GoodsReceiptCaseWhereInput = {
  OR: [{ status: { in: ABLAGEN_STATUSES } }, { forwardedTo: { not: null } }],
};

/**
 * Row-Umfang jeder Pool-Projektion: Aufwands-Eingaben, der volle Meldungs-Verlauf
 * und das zugewiesene Bündel (A5-Warteposition). Geteilt von der paginierten
 * Belege-Liste und den vollständigen Ablagen, damit beide dieselbe Karte zeigen.
 */
const poolItemInclude = {
  ...caseEffortInclude,
  // C4 + Instruktions-Loop (04.08.2026): ALLE Meldungen inkl. Verlauf —
  // die Problemfälle-Karte zeigt Anzahl + Einzel-Status je Meldung.
  issues: {
    orderBy: { reportedAt: 'asc' },
    include: {
      messages: true,
      // Standardanweisung der Problemart (Vorlage für den Instruktions-Dialog).
      reason: { select: { defaultInstruction: true, autoInsert: true } },
    },
  },
  assignedBundle: {
    select: {
      id: true,
      employee: { select: { employeeNo: true, displayName: true } },
      // A5 bundleQueue: position of the Beleg in its Bündel + whether the
      // Bündel is already running (any case in Arbeit).
      items: {
        orderBy: { sequence: 'asc' },
        select: { caseId: true, case: { select: { status: true } } },
      },
    },
  },
} satisfies Prisma.GoodsReceiptCaseInclude;

type PoolRow = Prisma.GoodsReceiptCaseGetPayload<{ include: typeof poolItemInclude }>;

/** Nur der Lieferungs-Ausschnitt des Universums, den die Pool-Projektion braucht. */
interface DeliveryGroupRefLookup {
  refFor: (caseId: string) => ReturnType<typeof mapDeliveryGroupRef> | null;
}

/** Compose the Prisma where clause from the Belege list query (scope + column filters, A2/A7). */
function poolWhere(query: PoolQueryDto): Prisma.GoodsReceiptCaseWhereInput {
  const and: Prisma.GoodsReceiptCaseWhereInput[] = [];
  if (query.scope && query.scope !== 'alle') {
    if (query.scope === 'topf') {
      // TL-Topf (A7): flagged for attention OR stuck in triage (blocked/needs_review).
      and.push({
        OR: [{ attentionFlag: true }, { status: { in: ['blocked', 'needs_review'] } }],
      });
    } else {
      and.push({ status: { in: SCOPE_STATUSES[query.scope] } });
    }
  }
  if (query.status) and.push({ status: query.status as CaseStatus });
  if (query.section !== undefined) and.push({ section: query.section });
  if (query.q) {
    and.push({
      OR: [
        { weBelegNo: { contains: query.q, mode: 'insensitive' } },
        { deliveryNoteNo: { contains: query.q, mode: 'insensitive' } },
        { storageLocation: { is: { code: { contains: query.q, mode: 'insensitive' } } } },
      ],
    });
  }
  if (query.shopNo) and.push({ primaryShopNo: { contains: query.shopNo, mode: 'insensitive' } });
  if (query.branchNo) and.push({ branchNo: { contains: query.branchNo, mode: 'insensitive' } });
  if (query.bereich) {
    // Bereich is DERIVED from the Lagerklasse (fixed vocabulary) — translate the
    // Bereich back to its storage kinds so the filter runs in the database.
    const kinds = locationKindSchema.options.filter(
      (kind) => bereichFromLocationKind(kind) === query.bereich,
    ) as LocationKind[];
    and.push({ storageLocation: { is: { kind: { in: kinds } } } });
  }
  if (query.assigned === 'yes') and.push({ assignedBundleId: { not: null } });
  if (query.assigned === 'no') and.push({ assignedBundleId: null });
  if (query.labels === 'yes') {
    and.push({
      workInstruction: {
        is: { OR: [{ priceLabelPrintRequired: true }, { boxLabelRequired: true }] },
      },
    });
  }
  if (query.labels === 'no') {
    and.push({
      OR: [
        { workInstruction: { is: null } },
        { workInstruction: { is: { priceLabelPrintRequired: false, boxLabelRequired: false } } },
      ],
    });
  }
  if (query.bookingFrom) {
    and.push({ bookingDate: { gte: new Date(`${query.bookingFrom}T00:00:00.000Z`) } });
  }
  if (query.bookingTo) {
    and.push({ bookingDate: { lte: new Date(`${query.bookingTo}T23:59:59.999Z`) } });
  }
  return and.length > 0 ? { AND: and } : {};
}

/** Inclusive UTC day window [start, end] for a YYYY-MM-DD calendar day. */
function dayWindow(date: string): { start: Date; end: Date } {
  return { start: new Date(`${date}T00:00:00.000Z`), end: new Date(`${date}T23:59:59.999Z`) };
}

/** YYYY-MM-DD slice of a Date, or null when absent. */
function isoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Type guard: a freeform JSON value that is a plain (non-array) object. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read an optional string field from a freeform audit `payload` (Prisma `Json`),
 * narrowing `unknown` safely via {@link isJsonObject}: non-object/array payloads
 * and non-string values yield `undefined` rather than forcing a cast.
 */
function readStringField(payload: unknown, key: string): string | undefined {
  if (!isJsonObject(payload)) return undefined;
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read side of the teamlead surface (§10/§11): pure, non-mutating projections of
 * the operational pool, day board, capacity/KPI tiles, the §7.2 audit feed, and
 * the §10.4 Belegdetails. Kept separate from the command service (park/prioritize
 * /bundle overrides) so read vs. write responsibilities stay cleanly isolated —
 * it depends on nothing but Prisma.
 */
@Injectable()
export class TeamleadReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listPool(query: PoolQueryDto): Promise<PoolListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = poolWhere(query);
    // Server-side sort (A2): validated column + direction, weBelegNo as the
    // deterministic tie-break so pagination never shuffles equal rows.
    const sortDir = query.sortDir ?? 'asc';
    const orderBy: Prisma.GoodsReceiptCaseOrderByWithRelationInput[] = [
      { [query.sortBy ?? 'bookingDate']: sortDir } as Prisma.GoodsReceiptCaseOrderByWithRelationInput,
      { weBelegNo: 'asc' },
    ];

    const [sortedIds, total, ruleConfig] = await Promise.all([
      this.prisma.goodsReceiptCase.findMany({ where, orderBy, select: { id: true } }),
      this.prisma.goodsReceiptCase.count({ where }),
      loadRuleConfig(this.prisma),
    ]);

    // Delivery groups come from the canonical, status-independent universe (all
    // Belege) — the same detection the Belegdetail shows, so chip and „Zugehörige
    // Lieferung" can never contradict each other across scopes or filters.
    const universe = await this.deliveryGroupUniverse(ruleConfig.grouping);

    // Gruppen-adjazente Ordnung (Frage 8): Mitglieder EINER Lieferung stehen in der
    // Liste zusammen. Die Gruppe wird dort einsortiert, wo ihr erstes Mitglied unter
    // der aktiven Sortierung erscheint (Anker); innerhalb des Blocks behalten die
    // Mitglieder ihre Sortier-Relativordnung, Einzel-Belege bleiben unberührt. Nur
    // gefilterte Mitglieder werden gezogen — der Chip zählt weiter das Universum.
    // Pagination bleibt zeilenbasiert (ein Block kann an einer Seitengrenze enden).
    const memberIdsByGroup = new Map<string, string[]>();
    const anchorSeq: Array<{ single: string } | { groupId: string }> = [];
    for (const { id } of sortedIds) {
      const groupId = universe.groupIdByCaseId.get(id);
      if (!groupId) {
        anchorSeq.push({ single: id });
        continue;
      }
      const members = memberIdsByGroup.get(groupId);
      if (members) {
        members.push(id);
      } else {
        memberIdsByGroup.set(groupId, [id]);
        anchorSeq.push({ groupId });
      }
    }
    const orderedIds = anchorSeq.flatMap((a) =>
      'single' in a ? [a.single] : memberIdsByGroup.get(a.groupId)!,
    );
    const pageIds = orderedIds.slice((page - 1) * limit, page * limit);

    const pageRows = await this.prisma.goodsReceiptCase.findMany({
      where: { id: { in: pageIds } },
      include: poolItemInclude,
    });
    const rowById = new Map(pageRows.map((r) => [r.id, r]));
    const rows = pageIds
      .map((id) => rowById.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);

    const items = await this.toPoolItems(rows, ruleConfig, universe);

    return { items, total, page, limit };
  }

  /**
   * Digitale Ablagen (§10.2): der VOLLSTÄNDIGE steuerbare Pool, bewusst OHNE
   * Pagination.
   *
   * Die Ablagen sind keine blätterbare Tabelle, sondern Ausnahme-Queues, deren
   * Zweck es ist, dass nichts in ihnen unbemerkt bleibt. Sie deshalb aus einer
   * Seite der Belege-Liste zu speisen, versteckte genau das: bei 688 Belegen
   * fielen alle vier Problemfälle aus dem 200-Zeilen-Fenster und die Lane stand
   * auf „Leer", obwohl es Meldungen gab (Kundenfeedback 05.08.2026). Die
   * Residenz-Regel gehört hierher, nicht ins Frontend — sonst filtert die
   * Anzeige über einer bereits unvollständigen Menge.
   */
  async listAblagenPool(): Promise<AblagenPoolDto> {
    const ruleConfig = await loadRuleConfig(this.prisma);
    const universe = await this.deliveryGroupUniverse(ruleConfig.grouping);
    const rows = await this.prisma.goodsReceiptCase.findMany({
      where: ABLAGEN_WHERE,
      // Deterministisch (älteste Buchung zuerst, weBelegNo als Tie-Break); die
      // Lane-Zuordnung und die Sortierung INNERHALB einer Lane macht das Board.
      orderBy: [{ bookingDate: 'asc' }, { weBelegNo: 'asc' }],
      include: poolItemInclude,
    });
    const items = await this.toPoolItems(rows, ruleConfig, universe);
    return { items, total: items.length };
  }

  /**
   * Rows → {@link PoolItemDto}: die gemeinsame Projektion der paginierten
   * Belege-Liste und der vollständigen Ablagen. Beide zeigen dieselbe Karte,
   * deshalb darf es dafür nur EINE Abbildung geben.
   */
  private async toPoolItems(
    rows: PoolRow[],
    ruleConfig: RuleConfig,
    universe: DeliveryGroupRefLookup,
  ): Promise<PoolItemDto[]> {
    // Größenzeilen NUR für Belege mit Meldungen nachladen (Positions-/EAN-Anker
    // der Issues) — der Pool selbst bleibt schlank.
    const issueCaseIds = rows.filter((r) => r.issues.length > 0).map((r) => r.id);
    const skuLinesByPosition = new Map<string, { id: string; ean: string; size: string }[]>();
    if (issueCaseIds.length > 0) {
      const skuLines = await this.prisma.receiptSkuLine.findMany({
        where: { position: { caseId: { in: issueCaseIds } } },
        select: { id: true, ean: true, size: true, receiptPositionId: true },
      });
      for (const line of skuLines) {
        const list = skuLinesByPosition.get(line.receiptPositionId) ?? [];
        list.push({ id: line.id, ean: line.ean, size: line.size });
        skuLinesByPosition.set(line.receiptPositionId, list);
      }
    }
    const issuePositionRefs = (c: (typeof rows)[number]): IssuePositionRef[] =>
      c.positions.map((p) => ({
        id: p.id,
        positionNo: p.positionNo,
        orderNo: p.orderNo,
        skuLines: skuLinesByPosition.get(p.id) ?? [],
      }));

    const items: PoolItemDto[] = rows.map((c) => {
      // Show the SAME effort the distribution uses: live-computed for instructionalised
      // cases, stored estimate otherwise (see resolveCaseEffort).
      const effort = resolveCaseEffort(c, ruleConfig.effort);
      return {
        id: c.id,
        weBelegNo: c.weBelegNo,
        status: c.status,
        section: c.section,
        priorityFlags: c.priorityFlags,
        totalQuantity: c.totalQuantity,
        estimatedMinutes: effort.minutes,
        storageLocationCode: c.storageLocation?.code ?? null,
        primaryShopNo: c.primaryShopNo ?? null,
        primaryShopAreaNo: c.primaryShopAreaNo ?? null,
        inboundCartonCount: c.inboundCartonCount ?? null,
        missingFields: c.missingFields,
        bookingDate: c.bookingDate.toISOString().slice(0, 10),
        goodsType: c.goodsTypeText,
        assignedEmployeeName: c.assignedBundle?.employee?.displayName ?? null,
        branchNo: c.branchNo,
        labelsRequired: isLabelsRequired(c.workInstruction),
        shopNos: distinctShopNos(c.primaryShopNo, c.positions),
        docuWareUrl: c.docuWareUrl,
        completedAt: c.completedAt ? c.completedAt.toISOString() : null,
        attentionFlag: c.attentionFlag,
        attentionNote: c.attentionNote,
        forwardedTo: c.forwardedTo,
        assignedEmployeeNo: c.assignedBundle?.employee?.employeeNo ?? null,
        effortPoints: effort.points,
        deliveryGroup: universe.refFor(c.id),
        bereich: c.storageLocation
          ? (bereichFromLocationKind(c.storageLocation.kind as LocationKind) ?? null)
          : null,
        bundleQueue: this.toBundleQueue(c.id, c.assignedBundle),
        issues:
          c.issues.length > 0
            ? c.issues.map((i) => mapIssueSummary(i, issuePositionRefs(c)))
            : undefined,
      };
    });

    return items;
  }

  /**
   * A5 „vorbereitet / als nächstes": project a case's place in its Bündel.
   * `null` when the case is not (or no longer) part of a bundle's item order.
   */
  private toBundleQueue(
    caseId: string,
    bundle: {
      id: string;
      employee: { displayName: string } | null;
      items: { caseId: string; case: { status: string } }[];
    } | null,
  ): BundleQueueRefDto | null {
    if (!bundle) return null;
    const index = bundle.items.findIndex((it) => it.caseId === caseId);
    if (index === -1) return null;
    return {
      bundleId: bundle.id,
      employeeName: bundle.employee?.displayName ?? '',
      position: index + 1,
      started: bundle.items.some((it) => it.case.status === 'in_progress'),
    };
  }

  /**
   * B1 WE-Nr-Zuweisung: look a Beleg up by its WE-Belegnummer and judge whether the
   * teamlead may assign it manually. `assignable` = `ready` AND unassigned; every
   * other outcome carries a `reasonCode` (not_found | already_assigned | wrong_status
   * | blocked) so the dialog renders a precise inline validation message.
   */
  async lookupCase(weBelegNoRaw: string): Promise<CaseLookupResultDto> {
    const weBelegNo = weBelegNoRaw.trim();
    const found = weBelegNo
      ? await this.prisma.goodsReceiptCase.findFirst({
          where: { weBelegNo: { equals: weBelegNo, mode: 'insensitive' } },
          include: {
            storageLocation: { select: { kind: true } },
            assignedBundle: { select: { employee: { select: { displayName: true } } } },
          },
        })
      : null;
    if (!found) {
      return {
        found: false,
        caseId: null,
        weBelegNo: null,
        status: null,
        bereich: null,
        teile: null,
        estimatedMinutes: null,
        assignedEmployeeName: null,
        assignable: false,
        reasonCode: 'not_found',
        deliveryGroup: null,
      };
    }

    const assignedEmployeeName = found.assignedBundle?.employee?.displayName ?? null;
    const assignable = found.status === 'ready' && found.assignedBundleId === null;
    let reasonCode: CaseLookupResultDto['reasonCode'] = null;
    if (!assignable) {
      if (found.assignedBundleId !== null) reasonCode = 'already_assigned';
      else if (found.status === 'blocked') reasonCode = 'blocked';
      else reasonCode = 'wrong_status';
    }

    // Delivery-group context so the dialog shows the „Lieferung ×n" chip before assigning.
    const detail = await this.deliveryGroupDetail(found.id);
    const deliveryGroup = detail ? (({ members: _members, ...ref }) => ref)(detail) : null;

    return {
      found: true,
      caseId: found.id,
      weBelegNo: found.weBelegNo,
      status: found.status,
      bereich: found.storageLocation
        ? (bereichFromLocationKind(found.storageLocation.kind as LocationKind) ?? null)
        : null,
      teile: found.totalQuantity,
      estimatedMinutes: found.estimatedMinutes,
      assignedEmployeeName,
      assignable,
      reasonCode,
      deliveryGroup,
    };
  }

  /**
   * A1/A2/B1 assign-flow search + browse: a bounded, ranked feed over the
   * assignable pool (ready + unassigned) behind AssignDialog. Unlike
   * {@link listPool}, there is no lifecycle `scope` — every result is already
   * assignable by construction. Ranking (exact WE-Nr > starts-with > contains >
   * other-field match, bookingDate tie-break) runs in {@link rankCaseSearchCandidates}
   * over a bounded candidate set fetched via {@link assignableSearchWhere}.
   */
  async searchCases(query: CaseSearchQueryDto): Promise<CaseSearchResultDto[]> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const where = assignableSearchWhere(query);
    // Fetch a broader candidate set than `limit` so ranking has enough to work with
    // before truncating (a plain DB `ORDER BY bookingDate` would bias toward the
    // oldest rows regardless of match quality). Capped at 150 to keep this endpoint
    // fast even on a large pool.
    const candidateTake = Math.min(limit * 3, 150);

    const [rows, ruleConfig] = await Promise.all([
      this.prisma.goodsReceiptCase.findMany({
        where,
        include: {
          ...caseEffortInclude,
        },
        orderBy: { bookingDate: 'asc' },
        take: candidateTake,
      }),
      loadRuleConfig(this.prisma),
    ]);

    const candidates: (CaseSearchCandidate & { row: (typeof rows)[number] })[] = rows.map((c) => ({
      id: c.id,
      weBelegNo: c.weBelegNo,
      deliveryNoteNo: c.deliveryNoteNo,
      storageLocationCode: c.storageLocation?.code ?? null,
      primaryShopNo: c.primaryShopNo ?? null,
      branchNo: c.branchNo,
      bookingDate: c.bookingDate,
      row: c,
    }));
    const ranked = rankCaseSearchCandidates(candidates, query.q).slice(0, limit);

    // Delivery groups from the SAME canonical universe as Liste/Detail — the assign
    // dialog shows this chip next to the WE-lookup one, so a ranked-set-only
    // detection would contradict the lookup for the very same Beleg.
    const universe = await this.deliveryGroupUniverse(ruleConfig.grouping);

    return ranked.map((r) => {
      const effort = resolveCaseEffort(r.row, ruleConfig.effort);
      return {
        caseId: r.row.id,
        weBelegNo: r.row.weBelegNo,
        bereich: r.row.storageLocation
          ? (bereichFromLocationKind(r.row.storageLocation.kind as LocationKind) ?? null)
          : null,
        goodsType: r.row.goodsTypeText,
        teile: r.row.totalQuantity,
        estimatedMinutes: effort.minutes,
        storageLocationCode: r.row.storageLocation?.code ?? null,
        priorityFlags: r.row.priorityFlags,
        deliveryGroup: universe.refFor(r.row.id),
      };
    });
  }

  async dashboard(now: Date = new Date()): Promise<DashboardDto> {
    const grouped = await this.prisma.goodsReceiptCase.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const countsByStatus: Record<string, number> = {};
    for (const g of grouped) countsByStatus[g.status] = g._count._all;

    const poolSize = (countsByStatus['ready'] ?? 0) + (countsByStatus['parked'] ?? 0);
    const prioOpen = await this.prisma.goodsReceiptCase.count({
      where: {
        priorityFlags: { hasSome: OPEN_PRIORITY_FLAGS },
        status: { notIn: ['completed', 'zst_done', 'cancelled'] },
      },
    });
    const oldest = await this.prisma.goodsReceiptCase.findFirst({
      where: { status: { notIn: ['completed', 'zst_done', 'cancelled'] } },
      orderBy: { bookingDate: 'asc' },
      select: { bookingDate: true },
    });

    return {
      countsByStatus,
      poolSize,
      prioOpen,
      oldestOpenBookingDate: oldest ? oldest.bookingDate.toISOString().slice(0, 10) : null,
      endOfShiftOpenCount: await this.countEndOfShiftOpen(now),
    };
  }

  /**
   * Punkt 6 (offen am Schichtende): non-terminal Belege still bound to a bundle whose
   * employee's shift for today has already ended (`plannedEnd < now`). A partially
   * completed Beleg counts as open (it is exactly the "halb bearbeitete Ware" concern).
   * Surfaced as a cockpit exception so the teamlead can act before anything is left over
   * night — the engine never re-distributes such Belege to other employees.
   */
  private async countEndOfShiftOpen(now: Date): Promise<number> {
    const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const endedShifts = await this.prisma.shift.findMany({
      where: { date: day, active: true, plannedEnd: { lt: now } },
      select: { employeeId: true },
    });
    if (endedShifts.length === 0) return 0;

    const bundles = await this.prisma.assignmentBundle.findMany({
      where: { date: day, employeeId: { in: endedShifts.map((s) => s.employeeId) } },
      select: { id: true },
    });
    if (bundles.length === 0) return 0;

    return this.prisma.goodsReceiptCase.count({
      where: {
        assignedBundleId: { in: bundles.map((b) => b.id) },
        status: { notIn: ['completed', 'zst_done', 'cancelled'] },
      },
    });
  }

  /**
   * §10.3 Mitarbeitenden-Board: EVERY employee scheduled for the day (active shift
   * with net capacity > 0) gets exactly one row, even with no assigned Belege — so
   * the teamlead always sees idle/free heads, not just the ones the engine loaded.
   * Assigned bundles + cases + route stops are folded onto those rows; an employee
   * who somehow holds a bundle without an active shift still gets a row so no work
   * is ever hidden. freeCapacityMinutes = Σ capacity − Σ planned across the rows
   * (negative = overbooked).
   */
  async board(date: string): Promise<BoardDto> {
    const day = new Date(`${date}T00:00:00.000Z`);
    const [bundles, shifts, ruleConfig] = await Promise.all([
      this.prisma.assignmentBundle.findMany({
        where: { date: day },
        include: {
          employee: {
            select: { employeeNo: true, displayName: true, bereiche: true, skillTier: true },
          },
          items: {
            orderBy: { sequence: 'asc' },
            include: {
              case: {
                select: {
                  id: true,
                  weBelegNo: true,
                  deliveryNoteNo: true,
                  deliverySourceGroupKey: true,
                  deliverySourceGroupSize: true,
                  manualDeliveryGroupKey: true,
                  deliveryGroupReleased: true,
                  bookingDate: true,
                  section: true,
                  status: true,
                  totalQuantity: true,
                  estimatedMinutes: true,
                  effortPoints: true,
                  // Effort-driver relations so each case line shows the SAME live effort
                  // the distribution used (resolveCaseEffort), not a stale stored value.
                  storageLocation: { select: { kind: true } },
                  workInstruction: {
                    select: {
                      priceLabelPrintRequired: true,
                      goodsReceiptCheckMode: true,
                      goodsReceiptCheckPercentage: true,
                    },
                  },
                  positions: {
                    orderBy: { positionNo: 'asc' },
                    select: {
                      wgr: true,
                      instruction: {
                        select: {
                          priceLabelAttachRequired: true,
                          securityRequired: true,
                          onlineHandlingRequired: true,
                          redPriceRequired: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          routeStops: { orderBy: { sequence: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.shift.findMany({
        where: { date: day, active: true, netCapacityMinutes: { gt: 0 }, employee: { active: true } },
        include: {
          employee: {
            select: { employeeNo: true, displayName: true, bereiche: true, skillTier: true },
          },
        },
      }),
      loadRuleConfig(this.prisma),
    ]);

    // Heutige Abwesenheiten (Schichtplan-Kalender): krank schlägt urlaub bei Überlappung.
    const absenceByEmployee = new Map<string, 'krank' | 'urlaub'>();
    for (const a of await this.prisma.employeeAbsence.findMany({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      select: { employeeId: true, kind: true },
    })) {
      if (absenceByEmployee.get(a.employeeId) !== 'krank') {
        absenceByEmployee.set(a.employeeId, a.kind);
      }
    }

    // Schichtfenster je Mitarbeiter (Früh/Spät-Farbe + „ab HH:MM" in der Matrix).
    const shiftWindowByEmployee = new Map<string, { start: string; end: string }>();
    for (const s of shifts) {
      if (!shiftWindowByEmployee.has(s.employeeId)) {
        shiftWindowByEmployee.set(s.employeeId, {
          start: s.plannedStart.toISOString(),
          end: s.plannedEnd.toISOString(),
        });
      }
    }

    const capacityByEmployee = new Map<string, number>();
    for (const s of shifts) {
      capacityByEmployee.set(
        s.employeeId,
        (capacityByEmployee.get(s.employeeId) ?? 0) + s.netCapacityMinutes,
      );
    }

    // Seed one IDLE row per scheduled employee first. The engine emits at most ONE
    // bundle per employee per day, so each row maps 1:1 to a bundle once folded; the
    // per-employee fold is kept defensively so a legacy multi-bundle day still renders.
    // `bundleId === null` marks a free head with no Bündel. Delivery-group detection
    // inputs are collected while folding so groups span ALL assigned Belege (Punkt 1).
    const groupInputs: {
      id: string;
      weBelegNo: string;
      deliveryNoteNo: string | null;
      deliverySourceGroupKey: string | null;
      deliverySourceGroupSize: number | null;
      manualDeliveryGroupKey: string | null;
      bookingDate: string;
      section: number | null;
      deliveryGroupReleased: boolean;
    }[] = [];

    const rowByEmployee = new Map<string, BoardRowDto>();
    for (const s of shifts) {
      if (rowByEmployee.has(s.employeeId)) continue;
      rowByEmployee.set(s.employeeId, {
        employeeNo: s.employee.employeeNo,
        employeeName: s.employee.displayName,
        skillTier: s.employee.skillTier,
        bundleId: null,
        bundleStatus: 'idle',
        plannedEffortMinutes: 0,
        plannedTeile: 0,
        capacityMinutes: capacityByEmployee.get(s.employeeId) ?? 0,
        bereiche: s.employee.bereiche,
        shiftStart: shiftWindowByEmployee.get(s.employeeId)?.start ?? null,
        shiftEnd: shiftWindowByEmployee.get(s.employeeId)?.end ?? null,
        absence: absenceByEmployee.get(s.employeeId) ?? null,
        cases: [],
        routeStops: [],
        packs: [],
      });
    }

    for (const b of bundles) {
      let row = rowByEmployee.get(b.employeeId);
      if (!row) {
        // Edge: a bundle whose employee has no active shift today. Still surface it
        // so assigned work is never dropped from the board.
        row = {
          employeeNo: b.employee.employeeNo,
          employeeName: b.employee.displayName,
          skillTier: b.employee.skillTier,
          bundleId: null,
          bundleStatus: 'idle',
          plannedEffortMinutes: 0,
          plannedTeile: 0,
          capacityMinutes: capacityByEmployee.get(b.employeeId) ?? 0,
          bereiche: b.employee.bereiche,
          shiftStart: shiftWindowByEmployee.get(b.employeeId)?.start ?? null,
          shiftEnd: shiftWindowByEmployee.get(b.employeeId)?.end ?? null,
          absence: absenceByEmployee.get(b.employeeId) ?? null,
          cases: [],
          routeStops: [],
          packs: [],
        };
        rowByEmployee.set(b.employeeId, row);
      }
      // First bundle owns the row's identity (the per-employee 1:1 case).
      if (row.bundleId === null) {
        row.bundleId = b.id;
        row.bundleStatus = b.status;
      }
      row.plannedEffortMinutes += b.plannedEffortMinutes;
      for (const it of b.items) {
        const effort = resolveCaseEffort(it.case, ruleConfig.effort);
        row.plannedTeile += it.case.totalQuantity;
        row.cases.push({
          id: it.case.id,
          weBelegNo: it.case.weBelegNo,
          bundleId: b.id,
          status: it.case.status,
          totalQuantity: it.case.totalQuantity,
          estimatedMinutes: effort.minutes,
          effortPoints: effort.points,
          // Delivery-group ref is filled in once all board cases are known (below).
          deliveryGroup: null,
        });
        groupInputs.push({
          id: it.case.id,
          weBelegNo: it.case.weBelegNo,
          deliveryNoteNo: it.case.deliveryNoteNo,
          deliverySourceGroupKey: it.case.deliverySourceGroupKey,
          deliverySourceGroupSize: it.case.deliverySourceGroupSize,
          manualDeliveryGroupKey: it.case.manualDeliveryGroupKey,
          bookingDate: it.case.bookingDate.toISOString().slice(0, 10),
          section: it.case.section,
          deliveryGroupReleased: it.case.deliveryGroupReleased,
        });
      }
      for (const rs of b.routeStops) {
        row.routeStops.push({
          id: rs.id,
          sequence: rs.sequence,
          locationCode: rs.locationCode,
          scanRequired: rs.scanRequired,
          scanned: rs.scannedAt !== null,
        });
      }
      // Pack-Grenzen (Starter-/Folge-Packs) kommen persistiert vom Item — jeder
      // Beleg gehört genau einem Pack, auch manuell einsortierte. Reihenfolge:
      // Packs aufsteigend, innerhalb eines Packs die Bündel-Reihenfolge.
      const packedCaseIds = new Map<number, string[]>();
      for (const it of b.items) {
        const list = packedCaseIds.get(it.packIndex) ?? [];
        list.push(it.caseId);
        packedCaseIds.set(it.packIndex, list);
      }
      for (const [packIndex, caseIds] of [...packedCaseIds.entries()].sort(([a], [c]) => a - c)) {
        // `index` ist der PERSISTIERTE Pack-Index, nicht die Position in dieser
        // Liste — genau der Wert, den `moveCase` als `targetPackIndex` erwartet.
        // Läuft ein Pack durch Verschieben leer, verschwindet sein Kasten; die
        // Indizes der übrigen Packs bleiben davon unberührt.
        //
        // Das aktive Pack ist das, an dem der MA gerade arbeitet; spätere Packs
        // sind vorgeplant und in seiner App noch unsichtbar.
        row.packs.push({ index: packIndex, caseIds, active: packIndex === b.activePackIndex });
      }
    }

    // Annotate each board case with its delivery group (same Lieferschein OR a
    // consecutive weBelegNo run), using the SAME pure engine detection + the §11
    // configured grouping rule. Standalone Belege keep null / size 1.
    const groups = detectDeliveryGroups(groupInputs, ruleConfig.grouping);
    const { groupIdByCaseId, groupById } = indexDeliveryGroups(groups);
    const groupInputById = new Map(groupInputs.map((g) => [g.id, g]));
    // Stable, deterministic order by name (idle heads stay interspersed, never hidden
    // at the end) with employeeNo as tie-break.
    const rows = [...rowByEmployee.values()].sort(
      (a, b) =>
        a.employeeName.localeCompare(b.employeeName) || a.employeeNo.localeCompare(b.employeeNo),
    );
    for (const row of rows) {
      for (const c of row.cases) {
        const group = groupById.get(groupIdByCaseId.get(c.id) ?? '');
        if (group) c.deliveryGroup = mapDeliveryGroupRef(group, groupInputById);
      }
    }

    const totalCapacity = rows.reduce((sum, r) => sum + r.capacityMinutes, 0);
    const totalPlanned = rows.reduce((sum, r) => sum + r.plannedEffortMinutes, 0);
    return { date, rows, freeCapacityMinutes: totalCapacity - totalPlanned };
  }

  /**
   * §10.1 Tagescockpit capacity tile. net = Σ active shift net minutes; planned =
   * Σ planned effort of non-cancelled/non-completed bundles; free = net − planned
   * (negative = overbooked).
   */
  async capacity(date: string): Promise<CapacityDto> {
    const day = new Date(`${date}T00:00:00.000Z`);
    const [shifts, bundles] = await Promise.all([
      this.prisma.shift.findMany({ where: { date: day, active: true } }),
      this.prisma.assignmentBundle.findMany({
        where: { date: day, status: { notIn: INACTIVE_BUNDLE_STATUSES } },
        select: { plannedEffortMinutes: true },
      }),
    ]);

    const netCapacityMinutes = shifts.reduce((sum, s) => sum + s.netCapacityMinutes, 0);
    const plannedMinutes = bundles.reduce((sum, b) => sum + b.plannedEffortMinutes, 0);
    const freeCapacityMinutes = netCapacityMinutes - plannedMinutes;
    const utilisationPct =
      netCapacityMinutes === 0 ? 0 : round1((plannedMinutes / netCapacityMinutes) * 100);

    return {
      date,
      plannedEmployees: shifts.length,
      netCapacityMinutes,
      plannedMinutes,
      freeCapacityMinutes,
      utilisationPct,
    };
  }

  /**
   * §10.1 ZST KPI tile. Aggregates ZstRecord completed on the day + case
   * statuses. workedMinutes is derived from each ZST record's elapsed time
   * (startedAt → completedAt); records without a startedAt contribute 0.
   */
  async kpis(date: string): Promise<KpiDto> {
    const { start, end } = dayWindow(date);
    const day = new Date(`${date}T00:00:00.000Z`);
    const [zstRecords, totalCases, completedCases] = await Promise.all([
      this.prisma.zstRecord.findMany({
        where: { completedAt: { gte: start, lte: end } },
        select: {
          completedQuantity: true,
          effortPoints: true,
          startedAt: true,
          completedAt: true,
          employee: { select: { measured: true } },
        },
      }),
      this.prisma.goodsReceiptCase.count({ where: { bookingDate: day } }),
      this.prisma.goodsReceiptCase.count({
        where: { bookingDate: day, status: { in: COMPLETED_STATUSES } },
      }),
    ]);

    // Throughput counts all records; performance/productivity counts only measured
    // employees, so temporary workers (measured=false) don't distort per-head KPIs.
    const totals = aggregateKpiTotals(
      zstRecords.map((z) => ({
        completedQuantity: z.completedQuantity,
        effortPoints: z.effortPoints,
        startedAt: z.startedAt,
        completedAt: z.completedAt,
        measured: z.employee.measured,
      })),
    );

    return { date, completedCases, totalCases, ...totals };
  }

  /**
   * §7.2/§16.2 audit feed: the append-only WorkflowEvent log newest-first, with
   * optional actorType/entityId/eventType filters. action/reason are projected
   * out of the event payload JSON (best-effort, since payload shape varies).
   */
  async auditEvents(query: EventQueryDto): Promise<AuditEventDto[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    // Optional comma-separated eventType allowlist (e.g. the cockpit's genuine
    // human-intervention set). Empty/blank entries are dropped; an all-blank list
    // is treated as "no filter" so a stray comma never silently hides every event.
    const eventTypes = (query.eventType ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const rows = await this.prisma.workflowEvent.findMany({
      where: {
        ...(query.actorType ? { actorType: query.actorType as never } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(eventTypes.length > 0 ? { eventType: { in: eventTypes } } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit,
    });

    return rows.map((e) => this.toAuditEvent(e));
  }

  /**
   * §10.4 Belegdetails: one rich case read — header + work instruction +
   * positions (with instruction flags, Positions-Kontext + SKU lines) +
   * the case's audit history (newest first). 404 if unknown.
   */
  async caseDetail(caseId: string): Promise<CaseDetailDto> {
    const found = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      include: {
        storageLocation: { select: { code: true, kind: true } },
        assignedBundle: { select: { employee: { select: { displayName: true } } } },
        workInstruction: true,
        positions: {
          orderBy: { positionNo: 'asc' },
          include: {
            instruction: true,
            skuLines: { orderBy: { ean: 'asc' } },
          },
        },
        issues: {
          orderBy: { reportedAt: 'desc' },
          include: {
            messages: true,
            reason: { select: { defaultInstruction: true, autoInsert: true } },
          },
        },
        zstRecords: { orderBy: { completedAt: 'asc' } },
      },
    });
    if (!found) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }

    // Same effort the distribution uses: live-computed when the case is instructionalised,
    // stored estimate otherwise. The per-driver breakdown shows where the minutes come from.
    const ruleConfig = await loadRuleConfig(this.prisma);
    const effort = resolveCaseEffort(found, ruleConfig.effort);

    const summary: CaseSummaryDto = {
      id: found.id,
      weBelegNo: found.weBelegNo,
      status: found.status,
      section: found.section,
      priorityFlags: found.priorityFlags,
      totalQuantity: found.totalQuantity,
      estimatedMinutes: effort.minutes,
      storageLocationCode: found.storageLocation?.code ?? null,
      primaryShopNo: found.primaryShopNo ?? null,
      primaryShopAreaNo: found.primaryShopAreaNo ?? null,
      inboundCartonCount: found.inboundCartonCount ?? null,
      missingFields: found.missingFields,
      bookingDate: found.bookingDate.toISOString().slice(0, 10),
      goodsType: found.goodsTypeText,
      assignedEmployeeName: found.assignedBundle?.employee?.displayName ?? null,
      branchNo: found.branchNo,
      labelsRequired: isLabelsRequired(found.workInstruction),
      shopNos: distinctShopNos(found.primaryShopNo, found.positions),
      docuWareUrl: found.docuWareUrl,
      completedAt: found.completedAt ? found.completedAt.toISOString() : null,
      attentionFlag: found.attentionFlag,
      attentionNote: found.attentionNote,
      forwardedTo: found.forwardedTo,
    };

    const history = await this.auditEvents({ entityId: caseId, limit: 200 });

    return {
      case: summary,
      effortPoints: effort.points,
      effortComputed: effort.computed,
      effortComponents: effort.components,
      deliveryNoteNo: found.deliveryNoteNo,
      primaryShopAreaNo: found.primaryShopAreaNo,
      primaryFloor: found.primaryFloor,
      catManDate: isoDay(found.catManDate),
      loadPlanDate: isoDay(found.loadPlanDate),
      goodsType: found.goodsTypeText,
      workInstruction: found.workInstruction ? mapWorkInstruction(found.workInstruction) : null,
      // Positions-Kontext (Shopbereich/Warenart) stammt aus dem Beleg-Kopf und wird
      // je Position gespiegelt — wie in der PWA (der frühere Boxen-Umweg entfällt).
      positions: found.positions.map((p) =>
        this.mapPositionDetail(p, found.primaryShopAreaNo, found.goodsTypeText),
      ),
      issues: found.issues.map((i) => mapIssueSummary(i, found.positions)),
      zstRecords: found.zstRecords.map((z) => ({
        id: z.id,
        completedQuantity: z.completedQuantity,
        effortPoints: z.effortPoints,
        completedAt: z.completedAt.toISOString(),
        exportedAt: z.exportedAt ? z.exportedAt.toISOString() : null,
        source: z.source,
      })),
      history,
      deliveryGroup: await this.deliveryGroupDetail(found.id),
    };
  }

  /**
   * Kanonische Lieferungs-Erkennung (Teamlead-Punkt 1): die reine Engine-Detection über
   * ALLE Belege — status- und buchungstagsUNabhängig. Eine physische Lieferung endet
   * weder am Lebenszyklus eines Mitglieds (zugewiesen/in Arbeit/fertig) noch am
   * Buchungstag: die T1/T2-Signale (Quell-Schlüssel, gleiche Lieferschein-Nr) verbinden
   * Nachzügler über Tage hinweg. Liste, Suche, WE-Lookup und Belegdetail lesen dieselbe
   * Erkennung — ein je-Tag oder je-Filter gescopetes Universum ließe Chip („Lieferung ×4")
   * und „Zugehörige Lieferung" widersprechen, genau der damit behobene Fehler.
   */
  private async deliveryGroupUniverse(grouping: GroupingConfig): Promise<{
    groupIdByCaseId: ReadonlyMap<string, string>;
    groupById: ReadonlyMap<string, DeliveryGroup>;
    casesById: ReadonlyMap<string, { id: string; weBelegNo: string; deliveryNoteNo: string | null }>;
    refFor: (caseId: string) => ReturnType<typeof mapDeliveryGroupRef> | null;
  }> {
    const rows = await this.prisma.goodsReceiptCase.findMany({
      select: {
        id: true,
        weBelegNo: true,
        deliveryNoteNo: true,
        deliverySourceGroupKey: true,
        deliverySourceGroupSize: true,
        manualDeliveryGroupKey: true,
        deliveryGroupReleased: true,
        bookingDate: true,
        section: true,
      },
    });
    const groups = detectDeliveryGroups(
      rows.map((c) => ({
        id: c.id,
        weBelegNo: c.weBelegNo,
        deliveryNoteNo: c.deliveryNoteNo,
        deliverySourceGroupKey: c.deliverySourceGroupKey,
        deliverySourceGroupSize: c.deliverySourceGroupSize,
        manualDeliveryGroupKey: c.manualDeliveryGroupKey,
        bookingDate: c.bookingDate.toISOString().slice(0, 10),
        section: c.section,
        deliveryGroupReleased: c.deliveryGroupReleased,
      })),
      grouping,
    );
    const { groupIdByCaseId, groupById } = indexDeliveryGroups(groups);
    const casesById = new Map(rows.map((c) => [c.id, c]));
    const refFor = (caseId: string) => {
      const group = groupById.get(groupIdByCaseId.get(caseId) ?? '');
      return group ? mapDeliveryGroupRef(group, casesById) : null;
    };
    return { groupIdByCaseId, groupById, casesById, refFor };
  }

  /**
   * Zugehörige Lieferung for the Belegdetailview (Teamlead-Punkt 1): the case's group
   * from the canonical universe ({@link deliveryGroupUniverse}) and every sibling with
   * who holds it. `null` when the Beleg is standalone.
   */
  private async deliveryGroupDetail(caseId: string): Promise<DeliveryGroupDetailDto | null> {
    const grouping = (await loadRuleConfig(this.prisma)).grouping;
    const universe = await this.deliveryGroupUniverse(grouping);
    const group = universe.groupById.get(universe.groupIdByCaseId.get(caseId) ?? '');
    if (!group) return null;
    // Status + Zuteilung nur für die Gruppenmitglieder nachladen (das Universum bleibt schmal).
    const memberRows = await this.prisma.goodsReceiptCase.findMany({
      where: { id: { in: [...group.caseIds] } },
      select: {
        id: true,
        weBelegNo: true,
        status: true,
        assignedBundle: { select: { employee: { select: { displayName: true } } } },
      },
    });
    const byId = new Map(memberRows.map((c) => [c.id, c]));
    const members: DeliveryGroupMemberDto[] = group.caseIds.map((id) => {
      const c = byId.get(id);
      return {
        caseId: id,
        weBelegNo: c?.weBelegNo ?? id,
        status: c?.status ?? 'unknown',
        assignedEmployeeName: c?.assignedBundle?.employee?.displayName ?? null,
        isCurrent: id === caseId,
      };
    });
    return { ...mapDeliveryGroupRef(group, universe.casesById), members };
  }

  // --- projection helpers ---------------------------------------------------

  private toAuditEvent(e: {
    id: string;
    seq: bigint;
    timestamp: Date;
    actorType: string;
    actorId: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    payload: unknown;
  }): AuditEventDto {
    return {
      id: e.id,
      seq: Number(e.seq),
      at: e.timestamp.toISOString(),
      actorType: e.actorType,
      actorId: e.actorId ?? '',
      eventType: e.eventType,
      entityType: e.entityType,
      entityId: e.entityId,
      action: readStringField(e.payload, 'action'),
      reason: readStringField(e.payload, 'reason'),
    };
  }

  private mapPositionDetail(
    p: {
      id: string;
      positionNo: number;
      orderNo?: string | null;
      wgr: string;
      supplierArticleNo: string;
      supplierColor: string;
      season?: string | null;
      nosFlag?: boolean | null;
      branchNo: string;
      shopNo: string;
      hShopNo?: string | null;
      floor?: string | null;
      status: string;
      instruction: {
        labelPrintVariant: LabelPrintVariant;
        securityRequired: boolean;
        onlineHandlingRequired: boolean;
      } | null;
      catMan?: boolean | null;
      catManDate?: Date | null;
      skuLines: Array<{
      id: string;
      ean: string;
      size: string;
      expectedQuantity: number;
      confirmedQuantity: number | null;
      ekPrice: number | null;
      vkPrice: number | null;
      vkLabelPrice: number | null;
      status: string;
    }>;
    },
    primaryShopAreaNo: string | null,
    goodsTypeText: string | null,
  ): PositionDetailDto {
    const skuLines: SkuLineDto[] = p.skuLines.map((s) => ({
      id: s.id,
      ean: s.ean,
      size: s.size,
      expectedQuantity: s.expectedQuantity,
      confirmedQuantity: s.confirmedQuantity,
      ekPrice: s.ekPrice,
      vkPrice: s.vkPrice,
      vkLabelPrice: s.vkLabelPrice,
      status: s.status,
      onlineMark: null,
    }));
    const expectedQuantity = skuLines.reduce((sum, s) => sum + s.expectedQuantity, 0);
    const confirmed = skuLines.filter((s) => s.confirmedQuantity !== null);
    const confirmedQuantity =
      confirmed.length > 0
        ? confirmed.reduce((sum, s) => sum + (s.confirmedQuantity ?? 0), 0)
        : null;
    return {
      id: p.id,
      positionNo: p.positionNo,
      orderNo: p.orderNo ?? null,
      wgr: p.wgr,
      wgrDescription: wgrDescription(p.wgr),
      catMan: p.catMan ?? null,
      catManDate: p.catManDate ? p.catManDate.toISOString().slice(0, 10) : null,
      supplierArticleNo: p.supplierArticleNo,
      supplierColor: p.supplierColor,
      season: p.season ?? null,
      nosFlag: p.nosFlag ?? null,
      branchNo: p.branchNo,
      shopNo: p.shopNo,
      hShopNo: p.hShopNo ?? null,
      floor: p.floor ?? null,
      // Shopbereich/Warenart stammen aus dem Beleg-Kopf und werden je Position
      // gespiegelt (wie PWA) — kein Boxen-Umweg mehr.
      shopAreaNo: primaryShopAreaNo,
      goodsType: goodsTypeText,
      expectedQuantity,
      confirmedQuantity,
      // Ohne gespeicherte Anweisung gilt der bisherige stille Standard „mit Preis".
      labelPrintVariant: p.instruction?.labelPrintVariant ?? 'etikett_mit_preis',
      securityRequired: p.instruction?.securityRequired ?? false,
      onlineHandlingRequired: p.instruction?.onlineHandlingRequired ?? false,
      status: p.status,
      skuLines,
    };
  }

}
