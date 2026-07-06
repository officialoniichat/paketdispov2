/**
 * Belege list + detail data layer (§10.4). Fetches the teamlead case endpoints
 * and maps the generated DTOs field-by-field onto the view-models the Belege
 * feature renders, so the components stay free of transport + narrowing concerns.
 *
 * Boundary narrowing follows the cockpit pattern (see {@link ./remoteDataset}):
 * the generated DTOs type enum-ish fields as plain `string`/`number`, so we
 * validate them against the @paket/domain-types Zod schemas before projecting
 * onto the domain unions instead of asserting with a bare `as`.
 */
import type {
  CaseStatus,
  ForwardRecipient,
  PriorityFlag,
  SectionCode,
  WorkflowEventType,
} from '@paket/domain-types';
import type { components } from '@paket/api-client';
import type { EffortComponents } from '@paket/assignment-engine';
import type { DeliveryGroupRef } from './types';
import { api } from './api.js';
import { unwrap } from './http.js';
import { toCaseStatus, toEventType, toPriorityFlags, toSectionCode } from './narrow.js';

type PoolItemDto = components['schemas']['PoolItemDto'];
type CaseLookupResultDto = components['schemas']['CaseLookupResultDto'];
type PoolListDto = components['schemas']['PoolListDto'];
type CaseDetailDto = components['schemas']['CaseDetailDto'];
type PositionDetailDto = components['schemas']['PositionDetailDto'];
type SkuLineDto = components['schemas']['SkuLineDto'];
type TransportBoxTargetDto = components['schemas']['TransportBoxTargetDto'];
type AuditEventDto = components['schemas']['AuditEventDto'];
type IssueSummaryDto = components['schemas']['IssueSummaryDto'];
type ZstSummaryDto = components['schemas']['ZstSummaryDto'];
type WorkInstructionHeaderDto = components['schemas']['WorkInstructionHeaderDto'];

/** Server page size of the Beleg list (real pagination, A2). */
export const BELEGE_PAGE_LIMIT = 50;

// ---------------------------------------------------------------------------
// View-state (server-driven list: scope + column filters + sort + page, A2)
// ---------------------------------------------------------------------------

/** Lebenszyklus-Scope of the Beleg list — mapped server-side (A2/A6/A7). */
export type BelegeScope = 'aktiv' | 'abgeschlossen' | 'archiv' | 'topf' | 'alle';

/** Server-side sortable list columns (mirrors the backend PoolSortField). */
export type BelegeSortField =
  | 'weBelegNo'
  | 'bookingDate'
  | 'totalQuantity'
  | 'effortPoints'
  | 'status'
  | 'section'
  | 'branchNo'
  | 'primaryShopNo'
  | 'completedAt';

/** Per-column filters — every value becomes a server query param (A2). */
export interface BelegeFilters {
  /** Volltext: WE-Nr / Lagerplatz / Lieferschein (contains). */
  q?: string;
  status?: CaseStatus;
  shopNo?: string;
  branchNo?: string;
  section?: SectionCode;
  labels?: 'yes' | 'no';
  assigned?: 'yes' | 'no';
  bookingFrom?: string;
  bookingTo?: string;
}

/** The complete server-driven view state — doubles as the query key. */
export interface BelegeViewState {
  scope: BelegeScope;
  /** 1-based page. */
  page: number;
  sortBy: BelegeSortField | null;
  sortDir: 'asc' | 'desc';
  filters: BelegeFilters;
}

// ---------------------------------------------------------------------------
// View-models
// ---------------------------------------------------------------------------

/** A5: where an assigned Beleg sits in its Bündel („vorbereitet · Pos n"). */
export interface BundleQueueRef {
  bundleId: string;
  employeeName: string;
  position: number;
  started: boolean;
}

/** One row of the §10.4 Beleg list table. */
export interface BelegRow {
  id: string;
  weBelegNo: string;
  status: CaseStatus;
  section: SectionCode | null;
  goodsType: string;
  quantity: number;
  effortPoints: number;
  minutes: number;
  storageCode: string;
  assignedTo: string;
  priorityFlags: PriorityFlag[];
  /** Filiale (Beleg-Kopf, A1). */
  branchNo: string;
  /** Alle Shops (Primär zuerst) — Mehr-Shop-Belege zeigen „+n" (A3). */
  shopNos: string[];
  /** Etiketten nötig (abgeleitet aus der Arbeitsanweisung, A1). */
  labelsRequired: boolean;
  bookingDate: string;
  /** ISO-Abschlusszeitpunkt (Archiv-Spalte, A6); null solange offen. */
  completedAt: string | null;
  /** DocuWare-Langzeitarchiv-Link (A6, mock); null solange offen. */
  docuWareUrl: string | null;
  /** TL-Topf (A7): „Besondere Aufmerksamkeit". */
  attentionFlag: boolean;
  attentionNote: string | null;
  /** Intake-Gate: fehlende Pflichtfelder (blocked-Belege im Topf). */
  missingFields: string[];
  /** Fester Bereich des Belegs (Zuweisen-Dialog, weiche Warnung). */
  bereich: string | null;
  /** „Gehört zusammen"-Lieferung; null für Einzel-Belege (A1). */
  deliveryGroup: DeliveryGroupRef | null;
  /** Bündel-Position für „vorbereitet · Pos n" (A5); null ohne Bündel. */
  bundleQueue: BundleQueueRef | null;
}

/** One server page of the Beleg list plus the total for the pagination. */
export interface BelegeListResult {
  rows: BelegRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Lifecycle phase — the human grouping over the 10 §7.1 case statuses
 * (see docs/concept/beleg-lifecycle-completion-concept.md). Gives the Belege view
 * a one-word answer to "where is my Beleg?" and drives the scope switcher.
 */
export type CasePhase = 'eingang' | 'pool' | 'arbeit' | 'abgeschlossen' | 'erledigt';

const PHASE_BY_STATUS: Record<CaseStatus, CasePhase> = {
  needs_review: 'eingang',
  // Intake-Gate (D1): blockierte Belege gehören in den Eingangs-Scope.
  blocked: 'eingang',
  ready: 'pool',
  parked: 'pool',
  assigned: 'arbeit',
  in_progress: 'arbeit',
  issue_open: 'arbeit',
  partially_completed: 'abgeschlossen',
  completed: 'abgeschlossen',
  zst_done: 'erledigt',
  cancelled: 'erledigt',
};

/** Map a case status onto its lifecycle phase. */
export function casePhase(status: CaseStatus): CasePhase {
  return PHASE_BY_STATUS[status];
}

/** Short German phase label for the lead column / scope chips. */
export const PHASE_LABEL: Record<CasePhase, string> = {
  eingang: 'Eingang',
  pool: 'Pool',
  arbeit: 'In Arbeit',
  abgeschlossen: 'Abgeschlossen',
  erledigt: 'Erledigt',
};

export interface BelegSkuLine {
  id: string;
  ean: string;
  size: string;
  expectedQuantity: number;
  confirmedQuantity: number | null;
  status: string;
}

export interface BelegPosition {
  id: string;
  positionNo: number;
  wgr: string;
  supplierColor: string;
  expectedQuantity: number;
  confirmedQuantity: number | null;
  priceLabelRequired: boolean;
  securityRequired: boolean;
  onlineHandlingRequired: boolean;
  status: string;
  skuLines: BelegSkuLine[];
}

export interface BelegBox {
  id: string;
  boxNo: number;
  shopAreaNo: string;
  floor: string | null;
  quantity: number;
  labelStatus: string;
  sealed: boolean;
}

export interface BelegIssue {
  id: string;
  scope: string;
  issueType: string;
  status: string;
  description: string | null;
  resolution: string | null;
  reportedAt: string;
}

export interface BelegZst {
  id: string;
  completedQuantity: number;
  effortPoints: number;
  completedAt: string;
  exportedAt: string | null;
  source: string;
}

export interface BelegHistoryEntry {
  id: string;
  timestamp: string;
  eventType: WorkflowEventType;
  actorType: string;
  reason: string | null;
}

export interface BelegWorkInstruction {
  priceLabelPrintRequired: boolean;
  sortByArticleColorSizeRequired: boolean;
  goodsReceiptCheckMode: string;
  goodsReceiptCheckPercentage: number | null;
  minimumQuantityCheckAlwaysRequired: boolean;
  boxLabelRequired: boolean;
  zstRequired: boolean;
}

/** The full §10.4 Belegdetails view-model (the 7 tabs read from this). */
/** One sibling Beleg of the Lieferung in the Belegdetail panel. */
export interface DeliveryGroupMember {
  caseId: string;
  weBelegNo: string;
  status: CaseStatus;
  assignedEmployeeName: string | null;
  isCurrent: boolean;
}

/** „Zugehörige Lieferung" detail (ref + siblings) for the Belegdetailview. */
export interface DeliveryGroupDetail extends DeliveryGroupRef {
  members: DeliveryGroupMember[];
}

export interface BelegDetail {
  id: string;
  weBelegNo: string;
  status: CaseStatus;
  section: SectionCode | null;
  priorityFlags: PriorityFlag[];
  deliveryNoteNo: string | null;
  bookingDate: string;
  storageCode: string;
  primaryShopAreaNo: string | null;
  primaryFloor: string | null;
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
  /** true = Aufwand live aus der Arbeitsanweisung berechnet; false = gespeicherter Schätzwert. */
  effortComputed: boolean;
  /** Per-Treiber-Minutenaufschlüsselung; null beim gespeicherten Schätzwert. */
  effortComponents: EffortComponents | null;
  catManDate: string | null;
  loadPlanDate: string | null;
  goodsType: string | null;
  assignedEmployeeName: string | null;
  /** Filiale (Beleg-Kopf, A1). */
  branchNo: string;
  /** Alle Shops des Belegs, Primär zuerst (A3). */
  shopNos: string[];
  /** Etiketten nötig (A1). */
  labelsRequired: boolean;
  /** Kartons der Anlieferung (A6-Kopf). */
  inboundCartonCount: number | null;
  /** DocuWare-Langzeitarchiv-Link (A6, mock). */
  docuWareUrl: string | null;
  /** Abschlusszeitpunkt (A6). */
  completedAt: string | null;
  /** TL-Topf (A7): „Besondere Aufmerksamkeit". */
  attentionFlag: boolean;
  attentionNote: string | null;
  /** C5 Digitale Ablage: Weiterleitungs-Empfänger; null = nicht weitergeleitet. */
  forwardedTo: string | null;
  hasOpenIssue: boolean;
  workInstruction: BelegWorkInstruction | null;
  positions: BelegPosition[];
  boxes: BelegBox[];
  issues: BelegIssue[];
  zstRecords: BelegZst[];
  history: BelegHistoryEntry[];
  /** Zugehörige Lieferung (Teamlead-Punkt 1): siblings + who holds them; null if standalone. */
  deliveryGroup: DeliveryGroupDetail | null;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/** Teamlead-Punkt 1: merge/confirm Belege into one locked Lieferung. */
export async function mergeDeliveryGroup(caseIds: string[]): Promise<void> {
  const result = await api.POST('/api/teamlead/delivery-groups/merge', {
    body: { caseIds },
  });
  unwrap(result, 'merge delivery group');
}

/** Teamlead-Punkt 1: split/remove Belege out of a Lieferung (each becomes solo). */
export async function splitDeliveryGroup(caseIds: string[]): Promise<void> {
  const result = await api.POST('/api/teamlead/delivery-groups/split', {
    body: { caseIds },
  });
  unwrap(result, 'split delivery group');
}

/** D2 „trotzdem bearbeiten": unvollständige Lieferung explizit freigeben (Pool-Hold aufheben). */
export async function releaseDeliveryGroup(caseIds: string[]): Promise<void> {
  const result = await api.POST('/api/teamlead/delivery-groups/release', {
    body: { caseIds },
  });
  unwrap(result, 'release delivery group');
}

/**
 * §10.4 Beleg list — server-driven (A2): scope, per-column filters, sort and
 * pagination all run in the backend; the client renders exactly one page.
 */
export async function fetchBelegeList(
  state: BelegeViewState,
  limit: number = BELEGE_PAGE_LIMIT,
): Promise<BelegeListResult> {
  const f = state.filters;
  const result = await api.GET('/api/teamlead/cases', {
    params: {
      query: {
        page: state.page,
        limit,
        scope: state.scope,
        ...(state.sortBy ? { sortBy: state.sortBy, sortDir: state.sortDir } : {}),
        ...(f.q ? { q: f.q } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.shopNo ? { shopNo: f.shopNo } : {}),
        ...(f.branchNo ? { branchNo: f.branchNo } : {}),
        ...(f.section !== undefined ? { section: f.section } : {}),
        ...(f.labels ? { labels: f.labels } : {}),
        ...(f.assigned ? { assigned: f.assigned } : {}),
        ...(f.bookingFrom ? { bookingFrom: f.bookingFrom } : {}),
        ...(f.bookingTo ? { bookingTo: f.bookingTo } : {}),
      },
    },
  });
  const dto = unwrap<PoolListDto>(result, 'cases');
  return { rows: dto.items.map(toBelegRow), total: dto.total, page: dto.page, limit: dto.limit };
}

/** Why a looked-up Beleg is not assignable (B1). Mirrors the backend verdict codes. */
export type BelegLookupReason = 'not_found' | 'already_assigned' | 'wrong_status' | 'blocked';

/** B1: WE-Nr lookup verdict for the board's Zuweisen dialog. */
export interface BelegLookup {
  found: boolean;
  caseId: string | null;
  weBelegNo: string | null;
  status: CaseStatus | null;
  bereich: string | null;
  teile: number | null;
  /** Geschätzte Bearbeitungsminuten — für die Bündel-Kapazitätsprüfung (A1). */
  estimatedMinutes: number | null;
  assignedEmployeeName: string | null;
  assignable: boolean;
  reasonCode: BelegLookupReason | null;
  deliveryGroup: DeliveryGroupRef | null;
}

/**
 * B1 WE-Nr-Zuweisung: look a Beleg up by WE-Belegnummer. The backend judges
 * assignability (ready + unassigned) and returns a verdict code — the dialog
 * only displays it (Fachlogik single-source).
 */
export async function lookupBeleg(weBelegNo: string): Promise<BelegLookup> {
  const result = await api.GET('/api/teamlead/cases/lookup', {
    params: { query: { weBelegNo } },
  });
  const dto = unwrap<CaseLookupResultDto>(result, 'case lookup');
  return {
    found: dto.found,
    caseId: dto.caseId ?? null,
    weBelegNo: dto.weBelegNo ?? null,
    status: dto.status != null ? toCaseStatus(dto.status) : null,
    bereich: dto.bereich ?? null,
    teile: dto.teile ?? null,
    estimatedMinutes: dto.estimatedMinutes ?? null,
    assignedEmployeeName: dto.assignedEmployeeName ?? null,
    assignable: dto.assignable,
    reasonCode: dto.reasonCode ?? null,
    deliveryGroup: dto.deliveryGroup
      ? {
          id: dto.deliveryGroup.id,
          signal: dto.deliveryGroup.signal,
          confidence: dto.deliveryGroup.confidence,
          presentSize: dto.deliveryGroup.presentSize,
          expectedSize: dto.deliveryGroup.expectedSize ?? null,
          missingCount: dto.deliveryGroup.missingCount,
          locked: dto.deliveryGroup.locked,
          released: dto.deliveryGroup.released,
        }
      : null,
  };
}

/** C5 Digitale Ablage: Beleg „Weiterleiten an …" (fester Empfänger-Katalog). */
export async function forwardCase(
  caseId: string,
  recipient: ForwardRecipient,
  reason?: string,
): Promise<void> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/forward', {
    params: { path: { caseId } },
    body: reason ? { recipient, reason } : { recipient },
  });
  unwrap(result, 'forward case');
}

/** C5 Digitale Ablage: Weiterleitung „Zurückholen" (Flag löschen). */
export async function unforwardCase(caseId: string): Promise<void> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/unforward', {
    params: { path: { caseId } },
    body: undefined,
  });
  unwrap(result, 'unforward case');
}

/** A7 TL-Topf: Beleg für „Besondere Aufmerksamkeit" markieren (Bucherinnen-Inlet mock). */
export async function flagAttention(caseId: string, note?: string): Promise<void> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/flag-attention', {
    params: { path: { caseId } },
    body: note ? { note } : {},
  });
  unwrap(result, 'flag attention');
}

/** A7 TL-Topf: Aufmerksamkeitsflag entfernen („aus Topf entlassen"). */
export async function unflagAttention(caseId: string): Promise<void> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/unflag-attention', {
    params: { path: { caseId } },
    body: undefined,
  });
  unwrap(result, 'unflag attention');
}

/**
 * D1 Freigabe aus dem Topf: blocked-Beleg an die Automatik zurückgeben. Ohne
 * nachgetragene Felder gibt der Server den Beleg nur frei, wenn nichts mehr
 * fehlt — sonst bleibt er (korrekt) blocked; the caller shows the result status.
 */
export async function releaseIntake(caseId: string): Promise<CaseStatus> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/complete-intake', {
    params: { path: { caseId } },
    body: {},
  });
  const dto = unwrap<{ status: string }>(result, 'complete intake');
  return toCaseStatus(dto.status);
}

/** §10.4 Belegdetails — one case with positions, boxes, history. */
export async function fetchBelegDetail(caseId: string): Promise<BelegDetail> {
  const result = await api.GET('/api/teamlead/cases/{caseId}', {
    params: { path: { caseId } },
  });
  const dto = unwrap<CaseDetailDto>(result, 'case detail');
  return toBelegDetail(dto);
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toBelegRow(item: PoolItemDto): BelegRow {
  return {
    id: item.id,
    weBelegNo: item.weBelegNo,
    status: toCaseStatus(item.status),
    section: toSectionCode(item.section),
    goodsType: item.goodsType ?? '–',
    quantity: item.totalQuantity,
    effortPoints: item.effortPoints,
    minutes: item.estimatedMinutes,
    storageCode: item.storageLocationCode ?? '–',
    assignedTo: item.assignedEmployeeName ?? '–',
    priorityFlags: toPriorityFlags(item.priorityFlags),
    branchNo: item.branchNo,
    shopNos: item.shopNos,
    labelsRequired: item.labelsRequired,
    bookingDate: item.bookingDate,
    completedAt: item.completedAt ?? null,
    docuWareUrl: item.docuWareUrl ?? null,
    attentionFlag: item.attentionFlag,
    attentionNote: item.attentionNote ?? null,
    missingFields: item.missingFields,
    bereich: item.bereich ?? null,
    deliveryGroup: item.deliveryGroup
      ? {
          id: item.deliveryGroup.id,
          signal: item.deliveryGroup.signal,
          confidence: item.deliveryGroup.confidence,
          presentSize: item.deliveryGroup.presentSize,
          expectedSize: item.deliveryGroup.expectedSize ?? null,
          missingCount: item.deliveryGroup.missingCount,
          locked: item.deliveryGroup.locked,
          released: item.deliveryGroup.released,
        }
      : null,
    bundleQueue: item.bundleQueue
      ? {
          bundleId: item.bundleQueue.bundleId,
          employeeName: item.bundleQueue.employeeName,
          position: item.bundleQueue.position,
          started: item.bundleQueue.started,
        }
      : null,
  };
}

function toBelegDetail(dto: CaseDetailDto): BelegDetail {
  const status = toCaseStatus(dto.case.status);
  return {
    id: dto.case.id,
    weBelegNo: dto.case.weBelegNo,
    status,
    section: toSectionCode(dto.case.section),
    priorityFlags: toPriorityFlags(dto.case.priorityFlags),
    deliveryNoteNo: dto.deliveryNoteNo ?? null,
    bookingDate: dto.case.bookingDate,
    storageCode: dto.case.storageLocationCode ?? '–',
    primaryShopAreaNo: dto.primaryShopAreaNo ?? null,
    primaryFloor: dto.primaryFloor ?? null,
    totalQuantity: dto.case.totalQuantity,
    effortPoints: dto.effortPoints,
    estimatedMinutes: dto.case.estimatedMinutes,
    effortComputed: dto.effortComputed,
    effortComponents: dto.effortComponents ?? null,
    catManDate: dto.catManDate ?? null,
    loadPlanDate: dto.loadPlanDate ?? null,
    goodsType: dto.goodsType ?? null,
    assignedEmployeeName: dto.case.assignedEmployeeName ?? null,
    branchNo: dto.case.branchNo,
    shopNos: dto.case.shopNos,
    labelsRequired: dto.case.labelsRequired,
    inboundCartonCount: dto.case.inboundCartonCount ?? null,
    docuWareUrl: dto.case.docuWareUrl ?? null,
    completedAt: dto.case.completedAt ?? null,
    attentionFlag: dto.case.attentionFlag,
    attentionNote: dto.case.attentionNote ?? null,
    forwardedTo: dto.case.forwardedTo ?? null,
    // The dedicated issue list is not part of the case detail read; an open issue
    // is reflected by the case status itself (§7.1 issue_open).
    hasOpenIssue: status === 'issue_open',
    workInstruction: dto.workInstruction ? toWorkInstruction(dto.workInstruction) : null,
    positions: dto.positions.map(toBelegPosition),
    boxes: dto.transportBoxes.map(toBelegBox),
    issues: dto.issues.map(toBelegIssue),
    zstRecords: dto.zstRecords.map(toBelegZst),
    history: dto.history.map(toBelegHistoryEntry),
    deliveryGroup: dto.deliveryGroup
      ? {
          id: dto.deliveryGroup.id,
          signal: dto.deliveryGroup.signal,
          confidence: dto.deliveryGroup.confidence,
          presentSize: dto.deliveryGroup.presentSize,
          expectedSize: dto.deliveryGroup.expectedSize ?? null,
          missingCount: dto.deliveryGroup.missingCount,
          locked: dto.deliveryGroup.locked,
          released: dto.deliveryGroup.released,
          members: dto.deliveryGroup.members.map((m) => ({
            caseId: m.caseId,
            weBelegNo: m.weBelegNo,
            status: toCaseStatus(m.status),
            assignedEmployeeName: m.assignedEmployeeName ?? null,
            isCurrent: m.isCurrent,
          })),
        }
      : null,
  };
}

function toWorkInstruction(wi: WorkInstructionHeaderDto): BelegWorkInstruction {
  return {
    priceLabelPrintRequired: wi.priceLabelPrintRequired,
    sortByArticleColorSizeRequired: wi.sortByArticleColorSizeRequired,
    goodsReceiptCheckMode: wi.goodsReceiptCheckMode,
    goodsReceiptCheckPercentage: wi.goodsReceiptCheckPercentage ?? null,
    minimumQuantityCheckAlwaysRequired: wi.minimumQuantityCheckAlwaysRequired,
    boxLabelRequired: wi.boxLabelRequired,
    zstRequired: wi.zstRequired,
  };
}

function toBelegPosition(p: PositionDetailDto): BelegPosition {
  return {
    id: p.id,
    positionNo: p.positionNo,
    wgr: p.wgr,
    supplierColor: p.supplierColor,
    expectedQuantity: p.expectedQuantity,
    confirmedQuantity: p.confirmedQuantity ?? null,
    priceLabelRequired: p.priceLabelRequired,
    securityRequired: p.securityRequired,
    onlineHandlingRequired: p.onlineHandlingRequired,
    status: p.status,
    skuLines: p.skuLines.map(toBelegSkuLine),
  };
}

function toBelegSkuLine(s: SkuLineDto): BelegSkuLine {
  return {
    id: s.id,
    ean: s.ean,
    size: s.size,
    expectedQuantity: s.expectedQuantity,
    confirmedQuantity: s.confirmedQuantity ?? null,
    status: s.status,
  };
}

function toBelegBox(b: TransportBoxTargetDto): BelegBox {
  return {
    id: b.id,
    boxNo: b.boxNo,
    shopAreaNo: b.shopAreaNo,
    floor: b.floor ?? null,
    quantity: b.quantity,
    labelStatus: b.labelStatus,
    sealed: b.sealed,
  };
}

function toBelegIssue(i: IssueSummaryDto): BelegIssue {
  return {
    id: i.id,
    scope: i.scope,
    issueType: i.issueType,
    status: i.status,
    description: i.description ?? null,
    resolution: i.resolution ?? null,
    reportedAt: i.reportedAt,
  };
}

function toBelegZst(z: ZstSummaryDto): BelegZst {
  return {
    id: z.id,
    completedQuantity: z.completedQuantity,
    effortPoints: z.effortPoints,
    completedAt: z.completedAt,
    exportedAt: z.exportedAt ?? null,
    source: z.source,
  };
}

function toBelegHistoryEntry(e: AuditEventDto): BelegHistoryEntry {
  return {
    id: e.id,
    timestamp: e.at,
    eventType: toEventType(e.eventType),
    actorType: e.actorType,
    reason: e.reason ?? null,
  };
}
