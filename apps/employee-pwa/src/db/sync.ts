/**
 * Loads the employee's assigned bundle from the backend into the local store.
 *
 * The assignment engine emits one Bereich-homogeneous bundle per employee/day;
 * the backend serves it via GET /api/me/today (bundle + route-ordered stops +
 * case summaries) and GET /api/me/cases/:id/aggregate (per-Beleg detail). This
 * module mirrors that into Dexie so the offline-first UI (useLiveQuery) works
 * unchanged: a bundle context, the consolidated collect-stop list, the assigned
 * Beleg list and a CaseProgress per case. It is idempotent and preserves any
 * in-progress CaseProgress / collect progress.
 */
import type { components } from '@paket/api-client';
import type {
  GoodsReceiptCase,
  ReceiptPosition,
  ReceiptSkuLine,
  TransportBoxTarget,
  WorkInstructionHeader,
  WorkInstructionPoint,
} from '@paket/domain-types';
import {
  caseStatusSchema,
  goodsTypeTextSchema,
  priorityFlagSchema,
  receiptPositionSchema,
  receiptSkuLineSchema,
  sectionCodeSchema,
  transportBoxTargetSchema,
  workInstructionPointSchema,
} from '@paket/domain-types';
import { db as defaultDb, type PaketDb } from './db.js';
import {
  putAggregate,
  putBelege,
  putBundle,
  putBundleProgress,
  putCollectStops,
  putProgress,
} from './repository.js';
import { buildCollectStops } from './collectStops.js';
import type { BelegListItem, BundleContext, CaseAggregate, GoodsCategory } from './types.js';
import { initialProgress } from '../workflow/workflowModel.js';
import { getApiClient } from '../data/api.js';
import { getSession } from '../data/session.js';

type CaseSummaryDto = components['schemas']['CaseSummaryDto'];
type CaseAggregateDto = components['schemas']['CaseAggregateDto'];
type WorkInstructionHeaderDto = components['schemas']['WorkInstructionHeaderDto'];
type ReceiptPositionDto = components['schemas']['ReceiptPositionDto'];
type TransportBoxTargetDto = components['schemas']['TransportBoxTargetDto'];

const DEFAULT_WORKSTATION = 'Tisch 1';

/** Narrow a DTO's loosely-typed nullable field to a string when present. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Map a CheckMode string onto the domain union, defaulting to quantity_only. */
function checkMode(mode: string): WorkInstructionHeader['goodsReceiptCheckMode'] {
  if (mode === 'percentage_check' || mode === 'full_check') return mode;
  return 'quantity_only';
}

function boxGoodsType(value: unknown): TransportBoxTarget['goodsType'] {
  const parsed = transportBoxTargetSchema.shape.goodsType.safeParse(value);
  return parsed.success ? parsed.data : 'mixed';
}

function boxLabelStatus(value: unknown): TransportBoxTarget['labelStatus'] {
  const parsed = transportBoxTargetSchema.shape.labelStatus.safeParse(value);
  return parsed.success ? parsed.data : 'pending';
}

function positionStatus(value: unknown): ReceiptPosition['status'] {
  const parsed = receiptPositionSchema.shape.status.safeParse(value);
  return parsed.success ? parsed.data : 'open';
}

function caseSection(value: unknown): GoodsReceiptCase['section'] {
  if (typeof value !== 'number') return null;
  const parsed = sectionCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function caseStatus(value: string): GoodsReceiptCase['status'] {
  return caseStatusSchema.parse(value);
}

function casePriorityFlags(values: readonly string[]): GoodsReceiptCase['priorityFlags'] {
  return values.filter(
    (flag): flag is GoodsReceiptCase['priorityFlags'][number] =>
      priorityFlagSchema.safeParse(flag).success,
  );
}

/** Map the DTO's Warenart (GoodsTypeText) onto the domain enum, dropping unknowns. */
function caseGoodsType(value: unknown): GoodsReceiptCase['goodsTypeText'] {
  const parsed = goodsTypeTextSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** CaseSummaryDto + section→domain case (synthesising fields the DTO omits). */
function toGoodsReceiptCase(summary: CaseSummaryDto): GoodsReceiptCase {
  return {
    id: summary.id,
    source: 'prohandel_api',
    externalRef: `ph-${summary.id}`,
    weBelegNo: summary.weBelegNo,
    bookingDate: summary.bookingDate,
    branchNo: '1',
    storageLocation: {
      id: `loc-${summary.storageLocationCode ?? 'unbekannt'}`,
      type: 'regal',
      code: summary.storageLocationCode ?? 'unbekannt',
      barcode: summary.storageLocationCode ?? undefined,
      active: true,
    },
    section: caseSection(summary.section),
    goodsTypeText: caseGoodsType(summary.goodsType),
    priorityFlags: casePriorityFlags(summary.priorityFlags),
    totalQuantity: summary.totalQuantity,
    status: caseStatus(summary.status),
    effortPoints: 0,
    estimatedMinutes: summary.estimatedMinutes,
    missingFields: summary.missingFields ?? [],
    deliveryGroupReleased: false,
    version: 0,
  };
}

function toWorkInstruction(
  caseId: string,
  wi: WorkInstructionHeaderDto | null | undefined,
): WorkInstructionHeader {
  return {
    caseId,
    priceLabelPrintRequired: wi?.priceLabelPrintRequired ?? false,
    sortByArticleColorSizeRequired: wi?.sortByArticleColorSizeRequired ?? false,
    goodsReceiptCheckMode: checkMode(wi?.goodsReceiptCheckMode ?? 'quantity_only'),
    // §G.1 guardrail: a minimum quantity control is always required.
    minimumQuantityCheckAlwaysRequired: true,
    boxLabelRequired: wi?.boxLabelRequired ?? true,
    zstRequired: wi?.zstRequired ?? true,
  };
}

/** Narrow a DTO SKU-line status onto the domain union, defaulting to `open`. */
function skuStatus(value: unknown): ReceiptSkuLine['status'] {
  const parsed = receiptSkuLineSchema.shape.status.safeParse(value);
  return parsed.success ? parsed.data : 'open';
}

/** Map the per-position Arbeitsanweisung instruction (null → all-false defaults). */
function toInstruction(
  dto: ReceiptPositionDto['instruction'],
): ReceiptPosition['instruction'] {
  if (!dto) {
    return {
      priceLabelRequired: false,
      priceLabelAttachRequired: false,
      securityRequired: false,
      onlineHandlingRequired: false,
    };
  }
  return {
    priceLabelRequired: dto.priceLabelRequired,
    priceLabelAttachRequired: dto.priceLabelAttachRequired,
    priceLabelAttachLocation: dto.priceLabelAttachLocation ?? undefined,
    securityRequired: dto.securityRequired,
    securityLocation: dto.securityLocation ?? undefined,
    onlineHandlingRequired: dto.onlineHandlingRequired,
    onlineHandlingLocation: dto.onlineHandlingLocation ?? undefined,
    redPriceRequired: dto.redPriceRequired ?? undefined,
    notes: dto.notes ?? undefined,
  };
}

/**
 * Build domain positions from the DTO, mapping the real per-position
 * Arbeitsanweisung instruction + SKU lines (EAN/size/Soll/Ist) it now carries.
 * Multiple positions and multiple SKU lines per position are handled dynamically.
 */
function toPositions(caseId: string, dtos: ReceiptPositionDto[]): ReceiptPosition[] {
  return dtos.map((dto) => ({
    id: dto.id,
    caseId,
    positionNo: dto.positionNo,
    wgr: dto.wgr,
    supplierArticleNo: dto.supplierArticleNo,
    supplierColor: dto.supplierColor,
    season: str(dto.season),
    nosFlag: dto.nosFlag ?? undefined,
    branchNo: dto.branchNo,
    shopNo: dto.shopNo,
    floor: str(dto.floor),
    instruction: toInstruction(dto.instruction),
    skuLines: dto.skuLines.map((s) => ({
      id: s.id,
      receiptPositionId: dto.id,
      ean: s.ean,
      size: s.size,
      expectedQuantity: s.expectedQuantity,
      confirmedQuantity: s.confirmedQuantity ?? undefined,
      status: skuStatus(s.status),
    })),
    status: positionStatus(dto.status),
  }));
}

/** Validate the derived Arbeitsanweisung points from the DTO, dropping any bad row. */
function toInstructionPoints(
  dtos: ReadonlyArray<components['schemas']['WorkInstructionPointDto']>,
): WorkInstructionPoint[] {
  return dtos.flatMap((d) => {
    const parsed = workInstructionPointSchema.safeParse({
      pointNo: d.pointNo ?? undefined,
      key: d.key,
      label: d.label,
      value: d.value,
      scope: d.scope,
      positionNos: d.positionNos,
    });
    return parsed.success ? [parsed.data] : [];
  });
}

function toBoxTargets(caseId: string, dtos: TransportBoxTargetDto[]): TransportBoxTarget[] {
  return dtos.map((dto) => ({
    id: dto.id,
    caseId,
    branchNo: dto.branchNo,
    shopAreaNo: dto.shopAreaNo,
    shopNo: str(dto.shopNo),
    hShopNo: undefined,
    floor: str(dto.floor),
    goodsType: boxGoodsType(dto.goodsType),
    positionIds: dto.positionIds,
    plannedQuantity: dto.plannedQuantity,
    actualQuantity: dto.quantity,
    labelStatus: boxLabelStatus(dto.labelStatus),
  }));
}

/** Coarse storage category (the DTO does not expose the location kind). */
function goodsCategory(value: unknown): GoodsCategory {
  if (value === 'palette' || value === 'haengeware' || value === 'mixed' || value === 'regal') {
    return value;
  }
  return 'regal';
}

const BEREICH_LABEL: Record<GoodsCategory, string> = {
  regal: 'Regal',
  palette: 'Palette',
  haengeware: 'Hängebahn',
  mixed: 'Gemischt',
};

/** Homogeneous Bereich label for the bundle, or null when the cart is mixed/empty. */
function deriveBereich(belege: readonly BelegListItem[]): string | null {
  if (belege.length === 0) return null;
  const kinds = new Set(belege.map((b) => b.goodsType));
  if (kinds.size === 1) {
    const [only] = [...kinds];
    return only ? BEREICH_LABEL[only] : null;
  }
  return 'Gemischt';
}

/** Map the assigned case summaries onto the PROCESS Beleg list, in bundle order. */
function toBelegList(cases: CaseSummaryDto[]): BelegListItem[] {
  return cases.map((c, index) => ({
    caseId: c.id,
    weBelegNo: c.weBelegNo,
    order: index,
    storageLocationCode: c.storageLocationCode ?? 'unbekannt',
    goodsType: goodsCategory(c.goodsType),
    totalQuantity: c.totalQuantity,
  }));
}

function toCaseAggregate(dto: CaseAggregateDto): CaseAggregate {
  const caseId = dto.case.id;
  return {
    caseId,
    case: toGoodsReceiptCase(dto.case),
    workInstruction: toWorkInstruction(caseId, dto.workInstruction),
    positions: toPositions(caseId, dto.positions),
    boxTargets: toBoxTargets(caseId, dto.boxTargets),
    instructionPoints: toInstructionPoints(dto.instructionPoints ?? []),
  };
}

export interface LoadResult {
  caseCount: number;
}

/**
 * Fetch today's assigned bundle for the current employee and mirror it into
 * Dexie. Clears any previously-cached bundle scope first (idempotent); preserves
 * an existing CaseProgress so in-progress work is not reset.
 */
export async function loadAssignedWork(db: PaketDb = defaultDb): Promise<LoadResult> {
  const api = getApiClient();
  const session = getSession();

  const { data: today, error } = await api.GET('/api/me/today');
  if (error || !today) {
    throw new Error('Tagesdaten konnten nicht geladen werden');
  }

  // Idempotent reset of the cached bundle scope (case progress is preserved).
  await db.bundle.clear();
  await db.collectStops.clear();
  await db.belege.clear();
  await db.aggregates.clear();

  const belege = toBelegList(today.cases);
  const bundleContext: BundleContext = {
    id: 'today',
    bundleId: today.bundle?.bundleId ?? 'offline',
    employeeName: session.displayName,
    workstation: DEFAULT_WORKSTATION,
    date: today.date,
    plannedEffortMinutes: today.bundle?.plannedEffortMinutes ?? 0,
    bereich: deriveBereich(belege),
    caseIds: today.cases.map((c) => c.id),
  };
  await putBundle(bundleContext, db);
  await putBelege(belege, db);

  const stops = buildCollectStops(
    today.bundle?.routeStops ?? [],
    today.cases.map((c) => ({ caseId: c.id, storageLocationCode: c.storageLocationCode ?? 'unbekannt' })),
  );
  await putCollectStops(stops, db);

  // Reset collect progress to the new pick list (collected stops do not survive a reload).
  await putBundleProgress(
    { id: 'today', collectedSequences: [], version: 0, updatedAt: new Date().toISOString() },
    db,
  );

  if (!today.cases.length) {
    return { caseCount: 0 };
  }

  const now = new Date().toISOString();
  for (const summary of today.cases) {
    const { data: aggDto, error: aggErr } = await api.GET('/api/me/cases/{caseId}/aggregate', {
      params: { path: { caseId: summary.id } },
    });
    if (aggErr || !aggDto) continue;
    const aggregate = toCaseAggregate(aggDto);
    await putAggregate(aggregate, db);
    const existing = await db.progress.get(aggregate.caseId);
    if (!existing) {
      await putProgress(initialProgress(aggregate, now), db);
    }
  }

  return { caseCount: today.cases.length };
}

export interface PullResult {
  assigned: boolean;
  reason?: string;
}

/**
 * §continuation (Pull-on-idle): ask the backend for the next cart-sized bundle.
 * On success the new bundle is mirrored into Dexie (loadAssignedWork) so the live
 * UI swaps to it. Returns the backend reason when nothing was assigned.
 */
export async function pullNextBundle(db: PaketDb = defaultDb): Promise<PullResult> {
  const { data, error } = await getApiClient().POST('/api/me/next-bundle');
  if (error || !data) return { assigned: false, reason: 'error' };
  if (data.assigned) await loadAssignedWork(db);
  return { assigned: data.assigned, reason: data.reason };
}
