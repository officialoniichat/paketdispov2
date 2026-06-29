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
  PriorityFlag,
  SectionCode,
  WorkflowEventType,
} from '@paket/domain-types';
import type { components } from '@paket/api-client';
import type { EffortComponents } from '@paket/assignment-engine';
import { api } from './api.js';
import { unwrap } from './http.js';
import { toCaseStatus, toEventType, toPriorityFlags, toSectionCode } from './narrow.js';

type PoolItemDto = components['schemas']['PoolItemDto'];
type PoolListDto = components['schemas']['PoolListDto'];
type CaseDetailDto = components['schemas']['CaseDetailDto'];
type PositionDetailDto = components['schemas']['PositionDetailDto'];
type SkuLineDto = components['schemas']['SkuLineDto'];
type TransportBoxTargetDto = components['schemas']['TransportBoxTargetDto'];
type AuditEventDto = components['schemas']['AuditEventDto'];
type IssueSummaryDto = components['schemas']['IssueSummaryDto'];
type ZstSummaryDto = components['schemas']['ZstSummaryDto'];
type WorkInstructionHeaderDto = components['schemas']['WorkInstructionHeaderDto'];

const BELEGE_PAGE_LIMIT = 200;

// ---------------------------------------------------------------------------
// View-models
// ---------------------------------------------------------------------------

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
}

/**
 * Lifecycle phase — the human grouping over the 10 §7.1 case statuses
 * (see docs/concept/beleg-lifecycle-completion-concept.md). Gives the Belege view
 * a one-word answer to "where is my Beleg?" and drives the scope switcher.
 */
export type CasePhase = 'eingang' | 'pool' | 'arbeit' | 'abgeschlossen' | 'erledigt';

const PHASE_BY_STATUS: Record<CaseStatus, CasePhase> = {
  needs_review: 'eingang',
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
  hasOpenIssue: boolean;
  workInstruction: BelegWorkInstruction | null;
  positions: BelegPosition[];
  boxes: BelegBox[];
  issues: BelegIssue[];
  zstRecords: BelegZst[];
  history: BelegHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/** §10.4 Beleg list — the full operational pool (pilot scale: one page of 200). */
export async function fetchBelegeList(): Promise<BelegRow[]> {
  const result = await api.GET('/api/teamlead/cases', {
    params: { query: { page: 1, limit: BELEGE_PAGE_LIMIT } },
  });
  const dto = unwrap<PoolListDto>(result, 'cases');
  return dto.items.map(toBelegRow);
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
    storageCode: item.storageLocationCode,
    assignedTo: item.assignedEmployeeName ?? '–',
    priorityFlags: toPriorityFlags(item.priorityFlags),
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
    storageCode: dto.case.storageLocationCode,
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
    // The dedicated issue list is not part of the case detail read; an open issue
    // is reflected by the case status itself (§7.1 issue_open).
    hasOpenIssue: status === 'issue_open',
    workInstruction: dto.workInstruction ? toWorkInstruction(dto.workInstruction) : null,
    positions: dto.positions.map(toBelegPosition),
    boxes: dto.transportBoxes.map(toBelegBox),
    issues: dto.issues.map(toBelegIssue),
    zstRecords: dto.zstRecords.map(toBelegZst),
    history: dto.history.map(toBelegHistoryEntry),
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
