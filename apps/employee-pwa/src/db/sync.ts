/**
 * Loads the employee's assigned bundle from the backend into the local store.
 *
 * The assignment engine emits one Bereich-homogeneous bundle per employee/day;
 * the backend serves it via GET /api/me/today (bundle + route-ordered stops +
 * case summaries) and GET /api/me/cases/:id/aggregate (per-Beleg detail). This
 * module mirrors that into Dexie so the offline-first UI (useLiveQuery) works
 * unchanged: a bundle context, the consolidated pick list, the assigned Beleg
 * list and a CaseProgress per case. It is idempotent and preserves any
 * in-progress CaseProgress. It also carries the Parkposition (B4) back to the
 * backend (POST /api/me/park).
 */
import type { components } from '@paket/api-client';
import type {
  GoodsReceiptCase,
  LocationKind,
  OnlineSizeMark,
  ReceiptPosition,
  ReceiptSkuLine,
  StorageLocation,
  TransportBoxTarget,
  WorkInstructionHeader,
  WorkInstructionPoint,
} from '@paket/domain-types';
import {
  caseStatusSchema,
  goodsTypeTextSchema,
  inspectionLevelCodeSchema,
  locationKindSchema,
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
import { createEventDraft } from '../events/eventDraft.js';
import { append } from '../events/eventLog.js';
import { getApiClient } from '../data/api.js';
import { getSession } from '../data/session.js';
import { getWorkstation, setWorkstation } from '../data/workstation.js';

type CaseSummaryDto = components['schemas']['CaseSummaryDto'];
type CaseAggregateDto = components['schemas']['CaseAggregateDto'];
type WorkInstructionHeaderDto = components['schemas']['WorkInstructionHeaderDto'];
type ReceiptPositionDto = components['schemas']['ReceiptPositionDto'];
type TransportBoxTargetDto = components['schemas']['TransportBoxTargetDto'];

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

/** Parse the summary's Lagerplatz-Art (LocationKind), or undefined when absent. */
function locationKind(value: unknown): LocationKind | undefined {
  const parsed = locationKindSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** LocationKind → coarse StorageLocation.type (the domain case's location taxonomy). */
function locationTypeFromKind(kind: LocationKind | undefined): StorageLocation['type'] {
  switch (kind) {
    case 'haengebahn':
      return 'haengebahn';
    case 'palette_a':
    case 'palette_b':
    case 'palette_c':
    case 'palette_e':
      return 'palette';
    case 'lagerplatz_d':
      return 'lagerplatz_d';
    default:
      return 'regal';
  }
}

/**
 * B6: derive the display GoodsCategory (icon) from the Lagerplatz-Art. The
 * Bereich is FIXED by the Lagerklasse — no free-text, no hardcoded 'regal'.
 */
export function goodsCategoryFromKind(kind: LocationKind | undefined): GoodsCategory {
  switch (kind) {
    case 'haengebahn':
      return 'haengeware';
    case 'palette_a':
    case 'palette_b':
    case 'palette_c':
    case 'palette_e':
      return 'palette';
    case 'regal':
    case 'lagerplatz_d':
      return 'regal';
    default:
      return 'mixed';
  }
}

/** CaseSummaryDto + section→domain case (synthesising fields the DTO omits). */
function toGoodsReceiptCase(summary: CaseSummaryDto): GoodsReceiptCase {
  const kind = locationKind(summary.storageLocationKind);
  return {
    id: summary.id,
    source: 'prohandel_api',
    externalRef: `ph-${summary.id}`,
    weBelegNo: summary.weBelegNo,
    bookingDate: summary.bookingDate,
    branchNo: '1',
    primaryShopNo: str(summary.primaryShopNo),
    inboundCartonCount:
      typeof summary.inboundCartonCount === 'number' && summary.inboundCartonCount > 0
        ? summary.inboundCartonCount
        : undefined,
    storageLocation: {
      id: `loc-${summary.storageLocationCode ?? 'unbekannt'}`,
      type: locationTypeFromKind(kind),
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
  const level = inspectionLevelCodeSchema.safeParse(wi?.inspectionLevelCode);
  return {
    caseId,
    priceLabelPrintRequired: wi?.priceLabelPrintRequired ?? false,
    sortByArticleColorSizeRequired: wi?.sortByArticleColorSizeRequired ?? false,
    goodsReceiptCheckMode: checkMode(wi?.goodsReceiptCheckMode ?? 'quantity_only'),
    goodsReceiptCheckPercentage: wi?.goodsReceiptCheckPercentage ?? undefined,
    inspectionLevelCode: level.success ? level.data : undefined,
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
    securityTypeCode: dto.securityTypeCode ?? undefined,
    onlineHandlingRequired: dto.onlineHandlingRequired,
    onlineHandlingLocation: dto.onlineHandlingLocation ?? undefined,
    redPriceRequired: dto.redPriceRequired ?? undefined,
    notes: dto.notes ?? undefined,
  };
}

/**
 * Build domain positions from the DTO, mapping the real per-position
 * Arbeitsanweisung instruction + SKU lines (EAN/Größe/EK/VK/Soll/Ist) it
 * carries. Multiple positions and multiple SKU lines per position are handled
 * dynamically.
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
    catMan: dto.catMan ?? undefined,
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
      ekPrice: s.ekPrice ?? undefined,
      vkPrice: s.vkPrice ?? undefined,
      vkLabelPrice: s.vkLabelPrice ?? undefined,
      status: skuStatus(s.status),
    })),
    status: positionStatus(dto.status),
  }));
}

/** A8: collect the backend-computed Rot/Grün marks per skuLine id. */
function toOnlineMarks(dtos: ReceiptPositionDto[]): Record<string, OnlineSizeMark> {
  const marks: Record<string, OnlineSizeMark> = {};
  for (const dto of dtos) {
    for (const s of dto.skuLines) {
      if (s.onlineMark === 'green' || s.onlineMark === 'red') marks[s.id] = s.onlineMark;
    }
  }
  return marks;
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

/** Map the assigned case summaries onto the Bearbeiten list, in bundle order. */
function toBelegList(cases: CaseSummaryDto[]): BelegListItem[] {
  return cases.map((c, index) => ({
    caseId: c.id,
    weBelegNo: c.weBelegNo,
    order: index,
    storageLocationCode: c.storageLocationCode ?? 'unbekannt',
    goodsType: goodsCategoryFromKind(locationKind(c.storageLocationKind)),
    totalQuantity: c.totalQuantity,
    goodsTypeText: caseGoodsType(c.goodsType),
    priceLabelPrintRequired: c.priceLabelPrintRequired === true,
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
    onlineMarks: toOnlineMarks(dto.positions),
    inspectionLevelLabel: str(dto.workInstruction?.inspectionLevelLabel),
    inspectionDescription: str(dto.workInstruction?.inspectionDescription),
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

  // A2: the backend knows the claimed Tisch — mirror it into the local claim so
  // 'Arbeitsplatz: Tisch X' reflects reality after a device change.
  if (today.workstation) {
    setWorkstation({ code: today.workstation.code, name: today.workstation.name });
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

export interface ParkResult {
  parkedCount: number;
}

/**
 * B4 Parkposition („Rest parken"): the cart is full — the given unstarted Belege
 * go back to the pool and re-enter the next Bündel. Backend mode POSTs
 * /api/me/park and re-mirrors the shrunk bundle; offline the Belege are removed
 * locally so the demo behaves identically. Each parked Beleg is logged as
 * `case.parked_by_employee` (drives the „geparkt" indicator).
 */
export async function parkRemainingBelege(
  caseIds: string[],
  db: PaketDb = defaultDb,
  backend = true,
): Promise<ParkResult> {
  if (caseIds.length === 0) return { parkedCount: 0 };
  if (backend) {
    const { error } = await getApiClient().POST('/api/me/park', { body: { caseIds } });
    if (error) {
      throw new Error('Parken fehlgeschlagen – bitte erneut versuchen');
    }
  }

  // Local mirror: drop the parked Belege from the cached bundle scope.
  const parked = new Set(caseIds);
  const bundle = await db.bundle.get('today');
  if (bundle) {
    await db.bundle.put({ ...bundle, caseIds: bundle.caseIds.filter((id) => !parked.has(id)) });
  }
  await db.belege.bulkDelete(caseIds);
  await db.aggregates.bulkDelete(caseIds);
  await db.progress.bulkDelete(caseIds);
  const stops = await db.collectStops.toArray();
  for (const stop of stops) {
    const remaining = stop.caseIds.filter((id) => !parked.has(id));
    if (remaining.length === 0) {
      await db.collectStops.delete(stop.sequence);
    } else if (remaining.length !== stop.caseIds.length) {
      await db.collectStops.put({ ...stop, caseIds: remaining });
    }
  }

  for (const caseId of caseIds) {
    await append(
      createEventDraft({
        eventType: 'case.parked_by_employee',
        entityType: 'case',
        entityId: caseId,
        payload: { reason: 'cart_full' },
      }),
      db,
    );
  }
  return { parkedCount: caseIds.length };
}
