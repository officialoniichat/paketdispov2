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
  IssueScope,
  IssueStatus,
  LabelPrintVariant,
  PriorityFlag,
  ProblemKind,
  SectionCode,
  SkuLineStatus,
  WorkflowEventType,
  ZstSource,
} from '@paket/domain-types';
import type { components } from '@paket/api-client';
import type { EffortComponents } from '@paket/assignment-engine';
import type { DeliveryGroupRef } from './types';
import { api } from './api.js';
import { unwrap } from './http.js';
import {
  toCaseStatus,
  toEventType,
  toIssueAuthorRole,
  toIssueMessageKind,
  toIssueScope,
  toIssueStatus,
  toPriorityFlags,
  toProblemKind,
  toSectionCode,
  toSkuLineStatus,
  toZstSource,
} from './narrow.js';
import type { CardIssueMessage } from './types.js';

type PoolItemDto = components['schemas']['PoolItemDto'];
type DeliveryGroupRefDto = components['schemas']['DeliveryGroupRefDto'];
type CaseLookupResultDto = components['schemas']['CaseLookupResultDto'];
type CaseSearchResultDto = components['schemas']['CaseSearchResultDto'];
type PoolListDto = components['schemas']['PoolListDto'];
type CaseDetailDto = components['schemas']['CaseDetailDto'];
type PositionDetailDto = components['schemas']['PositionDetailDto'];
type SkuLineDto = components['schemas']['SkuLineDto'];
type AuditEventDto = components['schemas']['AuditEventDto'];
type CaseParticipantDto = components['schemas']['CaseParticipantDto'];
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
  /** Digi Tags (07.08.2026): mind. eine Position druckt das Etikett OHNE Preis. */
  digiTags?: 'yes' | 'no';
  /** Sichern (07.08.2026): mind. eine Position verlangt Sicherung. */
  security?: 'yes' | 'no';
  assigned?: 'yes' | 'no';
  /** Monster-Belege (Teile ≥ gepflegte Schwelle) ein-/ausblenden — die Grenze kennt der Server. */
  monster?: 'yes' | 'no';
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
  /**
   * Monster-Beleg (C6): Teile ≥ gepflegte Schwelle ⇒ die Automatik verteilt ihn nicht,
   * er wartet auf die Teamlead-Entscheidung. Vom Backend gerechnet, hier nur angezeigt.
   */
  isMonster: boolean;
  /** Teil-Beleg: Id des Originals; null = kein Teil-Beleg. */
  parentCaseId: string | null;
  /** 1-basierte Teil-Nummer; null beim Original und bei normalen Belegen. */
  partNo: number | null;
  /** Anzahl der Teile, in die dieser Beleg aufgeteilt wurde (0 = nicht aufgeteilt). */
  partCount: number;
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
  /** C5 Digitale Ablage: Weiterleitungs-Empfänger; null = nicht weitergeleitet. */
  forwardedTo: string | null;
  /** Instruktions-Loop (04.08.2026): alle Meldungen inkl. Einzel-Status + Verlauf. */
  issues: BelegIssue[];
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
  // Geklärt: der Beleg liegt wieder beim SELBEN Mitarbeiter zur Weiterbearbeitung.
  problem_resolved: 'arbeit',
  completed: 'abgeschlossen',
  zst_done: 'erledigt',
  cancelled: 'erledigt',
  // Aufgeteilt: an der Klammer selbst passiert nichts mehr, aber ihre Teile werden
  // gerade bearbeitet — sie gehört deshalb zur Arbeit, nicht ins Archiv.
  split_container: 'arbeit',
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
  /** EK-Preis (A1) — Teamlead-Extra zur Klärung/Steuerung. */
  ekPrice: number | null;
  /** VK-Preis (A1). */
  vkPrice: number | null;
  /** VK-Etikett-Preis (A1). */
  vkLabelPrice: number | null;
  status: SkuLineStatus;
}

export interface BelegPosition {
  id: string;
  positionNo: number;
  /** Ordernummer (ERP-Referenz) — nur in der Teamlead-UX zur Fehlerlösung (Nachtrag 15.07.2026). */
  orderNo: string | null;
  wgr: string;
  /** WGR-Klartext (z. B. „D-Bermuda") — Positions-Kopf der kombinierten Ansicht. */
  wgrDescription: string | null;
  /** Lieferanten-Artikelnummer (Artikelidentität, wie PWA). */
  supplierArticleNo: string;
  supplierColor: string;
  /** Saison (Positions-Kontext, wie PWA). */
  season: string | null;
  /** NOS-Kennzeichen (Positions-Kontext, wie PWA). */
  nosFlag: boolean | null;
  /** CatMan-Termin der Position (ISO-Datum, Positions-Kontext wie PWA). */
  catManDate: string | null;
  /** HS (Hauptshop-Nr) der Position. */
  hShopNo: string | null;
  /** Shopnummer der Position. */
  shopNo: string;
  /** Etage der Position. */
  floor: string | null;
  /** Filiale (Positions-Kontext, wie PWA). */
  branchNo: string;
  /** Shopbereich (Beleg-Kopf, je Position gespiegelt wie PWA). */
  shopAreaNo: string | null;
  /** Warenart (Beleg-Kopf, je Position gespiegelt wie PWA). */
  goodsType: string | null;
  expectedQuantity: number;
  confirmedQuantity: number | null;
  /** Etikett-Druckvariante der Position (mit Preis / DigiTag ohne Preis / keins). */
  labelPrintVariant: LabelPrintVariant;
  securityRequired: boolean;
  onlineHandlingRequired: boolean;
  status: string;
  skuLines: BelegSkuLine[];
}

/**
 * One gesammeltes Problem eines Belegs (Kundenfeedback 14.07.2026). Manuelle
 * Probleme tragen den `reasonLabel`-Snapshot aus dem Problemarten-Katalog;
 * implizite (Mehr-/Minderlieferung, Preisabweichung) tragen Mengen-Delta bzw.
 * Preis-Korrektur.
 */
export interface BelegIssue {
  id: string;
  scope: IssueScope;
  kind: ProblemKind;
  /** Label-Snapshot aus dem Problemarten-Katalog (nur kind=manual). */
  reasonLabel: string | null;
  /** Mengen-Delta Ist−Soll (Mehr-/Minderlieferung); signiert. */
  deviationQty: number | null;
  /** VK-Etikett-Preis laut Beleg. */
  expectedVkPrice: number | null;
  /** Vom Mitarbeiter korrigierter VK (Preisabweichung). */
  correctedVkPrice: number | null;
  /** Positions-Nr, auf die sich das Problem bezieht. */
  positionNo: number | null;
  /** EAN der betroffenen Größenzeile. */
  ean: string | null;
  /** Größe der betroffenen Größenzeile. */
  size: string | null;
  /** Ordernummer der betroffenen Position (ERP-Referenz zur Fehlerlösung). */
  orderNo: string | null;
  status: IssueStatus;
  description: string | null;
  /** Text der jüngsten TL-Instruktion; null solange die Meldung offen ist. */
  instruction: string | null;
  /** Standardanweisung der Problemart (Katalog-Vorlage); null ohne Vorlage. */
  defaultInstruction: string | null;
  /** true = Vorlage im Instruktions-Dialog automatisch vorausfüllen. */
  defaultInstructionAuto: boolean;
  reportedAt: string;
  /** Instruktions-Verlauf chronologisch (Erst-Meldung zuerst). */
  messages: CardIssueMessage[];
}

export interface BelegZst {
  id: string;
  completedQuantity: number;
  effortPoints: number;
  completedAt: string;
  exportedAt: string | null;
  source: ZstSource;
}

export interface BelegHistoryEntry {
  id: string;
  timestamp: string;
  eventType: WorkflowEventType;
  actorType: string;
  reason: string | null;
}

/**
 * Beteiligung an einem geteilten Beleg (Konzept beleg-zusammenarbeit §4,
 * 31.08.2026) — Rolle/Status kommen bereits als Literal-Unions aus dem
 * generierten Schema, deshalb ist kein Zod-Narrowing nötig.
 */
export type BelegParticipantRole = CaseParticipantDto['role'];
export type BelegParticipantStatus = CaseParticipantDto['status'];

export interface BelegParticipant {
  participantId: string;
  employeeNo: string;
  displayName: string;
  role: BelegParticipantRole;
  status: BelegParticipantStatus;
  invitedAt: string;
  respondedAt: string | null;
  partDoneAt: string | null;
  /** Positionen des Belegs, die DIESER Beteiligte geprüft hat. */
  confirmedPositionCount: number;
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

/** The full §10.4 Belegdetails view-model (the Belegdetail tabs read from this). */
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
  issues: BelegIssue[];
  zstRecords: BelegZst[];
  history: BelegHistoryEntry[];
  /**
   * Geteilter Beleg: ALLE Beteiligten (jeder Status, chronologisch) — leer,
   * wenn der Beleg nie geteilt wurde. Fertige Belege behalten ihre Beteiligten.
   */
  participants: BelegParticipant[];
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
  unwrap(result, 'Zusammenführen der Lieferung');
}

/** Teamlead-Punkt 1: split/remove Belege out of a Lieferung (each becomes solo). */
export async function splitDeliveryGroup(caseIds: string[]): Promise<void> {
  const result = await api.POST('/api/teamlead/delivery-groups/split', {
    body: { caseIds },
  });
  unwrap(result, 'Auftrennen der Lieferung');
}

/** D2 „trotzdem bearbeiten": unvollständige Lieferung explizit freigeben (Pool-Hold aufheben). */
export async function releaseDeliveryGroup(caseIds: string[]): Promise<void> {
  const result = await api.POST('/api/teamlead/delivery-groups/release', {
    body: { caseIds },
  });
  unwrap(result, 'Freigeben der Lieferung');
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
        ...(f.digiTags ? { digiTags: f.digiTags } : {}),
        ...(f.security ? { security: f.security } : {}),
        ...(f.assigned ? { assigned: f.assigned } : {}),
        ...(f.monster ? { monster: f.monster } : {}),
        ...(f.bookingFrom ? { bookingFrom: f.bookingFrom } : {}),
        ...(f.bookingTo ? { bookingTo: f.bookingTo } : {}),
      },
    },
  });
  const dto = unwrap<PoolListDto>(result, 'Laden der Belege');
  return { rows: dto.items.map(toBelegRow), total: dto.total, page: dto.page, limit: dto.limit };
}

/** Why a looked-up Beleg is not assignable (B1). Mirrors the backend verdict codes. */
export type SplitCaseResult = components['schemas']['SplitCaseResultDto'];

/** Ein gewünschter Teil: Menge plus optional der Mitarbeiter, der ihn bekommt. */
export interface SplitPartInput {
  quantity: number;
  /** Leer = „ohne Zuweisung": der Teil geht in den Topf, die Automatik verteilt ihn. */
  employeeNo?: string;
}

/**
 * Beleg in echte Teil-Belege aufteilen. Die Fachlogik (Mengenverteilung entlang der
 * Größenzeilen, Container-Markierung, Zuweisung) liegt vollständig im Backend — hier
 * werden nur die Wunschmengen geschickt und das Ergebnis entgegengenommen.
 */
export async function splitCase(
  caseId: string,
  parts: SplitPartInput[],
  reason: string,
): Promise<SplitCaseResult> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/split', {
    params: { path: { caseId } },
    body: {
      reason,
      parts: parts.map((p) => ({
        quantity: p.quantity,
        ...(p.employeeNo ? { employeeNo: p.employeeNo } : {}),
      })),
    },
  });
  return unwrap<SplitCaseResult>(result, 'Aufteilen des Belegs');
}

export type CollaborationResult = components['schemas']['CollaborationResultDto'];

/**
 * „Gemeinsam zuweisen" (Konzept beleg-zusammenarbeit §4/§7): EIN Beleg wandert in
 * den Karren des ERSTEN Mitarbeiters, alle Genannten werden aktive Beteiligte —
 * es entstehen KEINE Teil-Belege. Voraussetzungen (ready|parked, kein Bündel,
 * mindestens zwei Mitarbeitende, Pflicht-Grund) prüft das Backend.
 */
export async function createCollaboration(
  caseId: string,
  employeeNos: string[],
  reason: string,
): Promise<CollaborationResult> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/collaboration', {
    params: { path: { caseId } },
    body: { employeeNos, reason },
  });
  return unwrap<CollaborationResult>(result, 'Gemeinsames Zuweisen');
}

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
  const dto = unwrap<CaseLookupResultDto>(result, 'Belegabfrage');
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
    deliveryGroup: dto.deliveryGroup ? toDeliveryGroupRef(dto.deliveryGroup) : null,
  };
}

/** One assignable Beleg in the search/browse feed (A1/A2/B1) — always ready + unassigned. */
export interface CaseSearchResult {
  caseId: string;
  weBelegNo: string;
  bereich: string | null;
  goodsType: string | null;
  teile: number;
  estimatedMinutes: number;
  storageLocationCode: string | null;
  priorityFlags: PriorityFlag[];
  deliveryGroup: DeliveryGroupRef | null;
  /** Filiale (Beleg-Kopf) — Zeilen-Infos beim Bündel-Anlegen (07.08.2026). */
  branchNo: string;
  /** Alle Shops (Primär zuerst) — Zeilen-Infos. */
  shopNos: string[];
  /** Vorkommende Etikett-Druckvarianten (Backend-Aggregat) — Zeilen-Infos. */
  labelPrintVariants: LabelPrintVariant[];
  /** Mindestens eine Position verlangt Sicherung (Backend-Aggregat). */
  securityRequired: boolean;
}

/** Query params for the assign-flow search/browse endpoint. */
export interface CaseSearchParams {
  q?: string;
  bereich?: string;
  shopNo?: string;
  branchNo?: string;
  limit?: number;
}

/**
 * A1/A2/B1: bounded, ranked search + browse over the assignable pool, behind
 * AssignDialog's live-search combobox and its "Durchsuchen" drawer.
 */
export async function searchAssignableCases(params: CaseSearchParams): Promise<CaseSearchResult[]> {
  const result = await api.GET('/api/teamlead/cases/search', {
    params: {
      query: {
        ...(params.q ? { q: params.q } : {}),
        ...(params.bereich ? { bereich: params.bereich } : {}),
        ...(params.shopNo ? { shopNo: params.shopNo } : {}),
        ...(params.branchNo ? { branchNo: params.branchNo } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
      },
    },
  });
  const dto = unwrap<CaseSearchResultDto[]>(result, 'Belegsuche');
  return dto.map(toSearchResult);
}

function toSearchResult(item: CaseSearchResultDto): CaseSearchResult {
  return {
    caseId: item.caseId,
    weBelegNo: item.weBelegNo,
    bereich: item.bereich ?? null,
    goodsType: item.goodsType ?? null,
    teile: item.teile,
    estimatedMinutes: item.estimatedMinutes,
    storageLocationCode: item.storageLocationCode ?? null,
    priorityFlags: toPriorityFlags(item.priorityFlags),
    deliveryGroup: item.deliveryGroup ? toDeliveryGroupRef(item.deliveryGroup) : null,
    // Zeilen-Infos (07.08.2026) — fertig aggregiert vom Backend, hier durchgereicht.
    branchNo: item.branchNo,
    shopNos: item.shopNos,
    labelPrintVariants: item.labelPrintVariants,
    securityRequired: item.securityRequired,
  };
}

/**
 * Project a search/browse result onto the AssignDialog tray's existing `BelegLookup`
 * shape. The endpoint's scope IS the assignability verdict, so `found`/`assignable`
 * are always true and there is no `reasonCode` — this only exists so both entry
 * points (exact lookup, search, browse) can share one `selected` tray state.
 */
export function searchResultToBelegLookup(result: CaseSearchResult): BelegLookup {
  return {
    found: true,
    caseId: result.caseId,
    weBelegNo: result.weBelegNo,
    status: 'ready',
    bereich: result.bereich,
    teile: result.teile,
    estimatedMinutes: result.estimatedMinutes,
    assignedEmployeeName: null,
    assignable: true,
    reasonCode: null,
    deliveryGroup: result.deliveryGroup,
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
  unwrap(result, 'Weiterleiten des Belegs');
}

/** C5 Digitale Ablage: Weiterleitung „Zurückholen" (Flag löschen). */
export async function unforwardCase(caseId: string): Promise<void> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/unforward', {
    params: { path: { caseId } },
    body: undefined,
  });
  unwrap(result, 'Zurückholen des Belegs');
}

/** A7 TL-Topf: Beleg für „Besondere Aufmerksamkeit" markieren (Bucherinnen-Inlet mock). */
export async function flagAttention(caseId: string, note?: string): Promise<void> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/flag-attention', {
    params: { path: { caseId } },
    body: note ? { note } : {},
  });
  unwrap(result, 'Markieren des Belegs');
}

/** A7 TL-Topf: Aufmerksamkeitsflag entfernen („aus Topf entlassen"). */
export async function unflagAttention(caseId: string): Promise<void> {
  const result = await api.POST('/api/teamlead/cases/{caseId}/unflag-attention', {
    params: { path: { caseId } },
    body: undefined,
  });
  unwrap(result, 'Aufheben der Markierung');
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
  const dto = unwrap<{ status: string }>(result, 'Abschließen der Erfassung');
  return toCaseStatus(dto.status);
}

/** §10.4 Belegdetails — one case with positions, boxes, history. */
export async function fetchBelegDetail(caseId: string): Promise<BelegDetail> {
  const result = await api.GET('/api/teamlead/cases/{caseId}', {
    params: { path: { caseId } },
  });
  const dto = unwrap<CaseDetailDto>(result, 'Laden der Belegdetails');
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
    isMonster: item.isMonster,
    parentCaseId: item.parentCaseId ?? null,
    partNo: item.partNo ?? null,
    partCount: item.partCount,
    bookingDate: item.bookingDate,
    completedAt: item.completedAt ?? null,
    docuWareUrl: item.docuWareUrl ?? null,
    attentionFlag: item.attentionFlag,
    attentionNote: item.attentionNote ?? null,
    missingFields: item.missingFields,
    bereich: item.bereich ?? null,
    forwardedTo: item.forwardedTo ?? null,
    issues: (item.issues ?? []).map(toBelegIssue),
    deliveryGroup: item.deliveryGroup ? toDeliveryGroupRef(item.deliveryGroup) : null,
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
    issues: dto.issues.map(toBelegIssue),
    zstRecords: dto.zstRecords.map(toBelegZst),
    history: dto.history.map(toBelegHistoryEntry),
    participants: dto.participants.map(toBelegParticipant),
    deliveryGroup: dto.deliveryGroup
      ? {
          ...toDeliveryGroupRef(dto.deliveryGroup),
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

/**
 * DTO→View-Projektion des „Lieferung ×n"-Refs — eine Kopie für Zeile, Lookup,
 * Suche und Detail, damit die Kennung (`label`, Frage 8) überall identisch ankommt.
 */
function toDeliveryGroupRef(dto: DeliveryGroupRefDto): DeliveryGroupRef {
  return {
    id: dto.id,
    label: dto.label,
    signal: dto.signal,
    confidence: dto.confidence,
    presentSize: dto.presentSize,
    expectedSize: dto.expectedSize ?? null,
    missingCount: dto.missingCount,
    locked: dto.locked,
    released: dto.released,
  };
}

function toBelegParticipant(p: CaseParticipantDto): BelegParticipant {
  return {
    participantId: p.participantId,
    employeeNo: p.employeeNo,
    displayName: p.displayName,
    role: p.role,
    status: p.status,
    invitedAt: p.invitedAt,
    respondedAt: p.respondedAt ?? null,
    partDoneAt: p.partDoneAt ?? null,
    confirmedPositionCount: p.confirmedPositionCount,
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
    orderNo: p.orderNo ?? null,
    wgr: p.wgr,
    wgrDescription: p.wgrDescription ?? null,
    supplierArticleNo: p.supplierArticleNo,
    supplierColor: p.supplierColor,
    season: p.season ?? null,
    nosFlag: p.nosFlag ?? null,
    catManDate: p.catManDate ?? null,
    hShopNo: p.hShopNo ?? null,
    shopNo: p.shopNo,
    floor: p.floor ?? null,
    branchNo: p.branchNo,
    shopAreaNo: p.shopAreaNo ?? null,
    goodsType: p.goodsType ?? null,
    expectedQuantity: p.expectedQuantity,
    confirmedQuantity: p.confirmedQuantity ?? null,
    labelPrintVariant: p.labelPrintVariant,
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
    ekPrice: s.ekPrice ?? null,
    vkPrice: s.vkPrice ?? null,
    vkLabelPrice: s.vkLabelPrice ?? null,
    status: toSkuLineStatus(s.status),
  };
}

function toBelegIssue(i: IssueSummaryDto): BelegIssue {
  return {
    id: i.id,
    scope: toIssueScope(i.scope),
    kind: toProblemKind(i.kind),
    reasonLabel: i.reasonLabel ?? null,
    deviationQty: i.deviationQty ?? null,
    expectedVkPrice: i.expectedVkPrice ?? null,
    correctedVkPrice: i.correctedVkPrice ?? null,
    positionNo: i.positionNo ?? null,
    ean: i.ean ?? null,
    size: i.size ?? null,
    orderNo: i.orderNo ?? null,
    status: toIssueStatus(i.status),
    description: i.description ?? null,
    instruction: i.instruction ?? null,
    defaultInstruction: i.defaultInstruction ?? null,
    defaultInstructionAuto: i.defaultInstructionAuto ?? false,
    reportedAt: i.reportedAt,
    messages: i.messages.map((m) => ({
      id: m.id,
      kind: toIssueMessageKind(m.kind),
      authorRole: toIssueAuthorRole(m.authorRole),
      authorName: m.authorName,
      createdAt: m.createdAt,
      text: m.text,
    })),
  };
}

function toBelegZst(z: ZstSummaryDto): BelegZst {
  return {
    id: z.id,
    completedQuantity: z.completedQuantity,
    effortPoints: z.effortPoints,
    completedAt: z.completedAt,
    exportedAt: z.exportedAt ?? null,
    source: toZstSource(z.source),
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
