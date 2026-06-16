/**
 * Loads the employee's assigned work from the backend into the local store.
 *
 * The assignment engine (run by a teamlead via recalculate) decides which
 * bundle ma-NNN gets; this module fetches that bundle + per-case aggregates
 * (GET /api/me/today, GET /api/me/cases/:id/aggregate) and mirrors them into
 * Dexie so the existing offline-first UI (useLiveQuery) works unchanged. It is
 * idempotent: each run clears and rewrites bundles/aggregates and inits a
 * CaseProgress per case when absent (preserving in-progress work).
 */
import type { components } from '@paket/api-client';
import type {
  GoodsReceiptCase,
  ReceiptPosition,
  TransportBoxTarget,
  WorkInstructionHeader,
} from '@paket/domain-types';
import {
  caseStatusSchema,
  priorityFlagSchema,
  receiptPositionSchema,
  sectionCodeSchema,
  transportBoxTargetSchema,
} from '@paket/domain-types';
import { db as defaultDb, type PaketDb } from './db.js';
import { putAggregate, putBelege, putDay, putProgress } from './repository.js';
import type { BelegListItem, CaseAggregate, DayContext } from './types.js';
import { initialProgress } from '../workflow/workflowModel.js';
import { getApiClient } from '../data/api.js';
import { getSession } from '../data/session.js';

type CurrentBundleDto = components['schemas']['CurrentBundleDto'];
type CaseSummaryDto = components['schemas']['CaseSummaryDto'];
type CaseAggregateDto = components['schemas']['CaseAggregateDto'];
type WorkInstructionHeaderDto = components['schemas']['WorkInstructionHeaderDto'];
type ReceiptPositionDto = components['schemas']['ReceiptPositionDto'];
type TransportBoxTargetDto = components['schemas']['TransportBoxTargetDto'];

const DEFAULT_WORKSTATION = 'Tisch 1';
const DEFAULT_PLANNED_START = '08:00';
const DEFAULT_PLANNED_END = '16:00';

/** Narrow a DTO's loosely-typed nullable field to a string when present. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Map a CheckMode string onto the domain union, defaulting to quantity_only. */
function checkMode(mode: string): WorkInstructionHeader['goodsReceiptCheckMode'] {
  if (mode === 'percentage_check' || mode === 'full_check') return mode;
  return 'quantity_only';
}

/** Map a DTO goodsType string onto the TransportBoxTarget union, defaulting to `mixed`. */
function boxGoodsType(value: unknown): TransportBoxTarget['goodsType'] {
  const parsed = transportBoxTargetSchema.shape.goodsType.safeParse(value);
  return parsed.success ? parsed.data : 'mixed';
}

/** Map a DTO labelStatus string onto the TransportBoxTarget union, defaulting to `pending`. */
function boxLabelStatus(value: unknown): TransportBoxTarget['labelStatus'] {
  const parsed = transportBoxTargetSchema.shape.labelStatus.safeParse(value);
  return parsed.success ? parsed.data : 'pending';
}

/** Map a DTO position status string onto the ReceiptPosition union, defaulting to `open`. */
function positionStatus(value: unknown): ReceiptPosition['status'] {
  const parsed = receiptPositionSchema.shape.status.safeParse(value);
  return parsed.success ? parsed.data : 'open';
}

/** Narrow a numeric DTO section to the domain `SectionCode`, or null when absent/invalid. */
function caseSection(value: unknown): GoodsReceiptCase['section'] {
  if (typeof value !== 'number') return null;
  const parsed = sectionCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Narrow a DTO status string onto the domain `CaseStatus` (throws on an unknown value). */
function caseStatus(value: string): GoodsReceiptCase['status'] {
  return caseStatusSchema.parse(value);
}

/** Keep only the DTO priority flags that are members of the domain `PriorityFlag` union. */
function casePriorityFlags(values: readonly string[]): GoodsReceiptCase['priorityFlags'] {
  return values.filter(
    (flag): flag is GoodsReceiptCase['priorityFlags'][number] =>
      priorityFlagSchema.safeParse(flag).success,
  );
}

/** CaseSummaryDto + section→domain case (synthesising fields the DTO omits). */
function toGoodsReceiptCase(summary: CaseSummaryDto): GoodsReceiptCase {
  return {
    id: summary.id,
    documentSetId: `ds-${summary.id}`,
    weBelegNo: summary.weBelegNo,
    bookingDate: summary.bookingDate,
    branchNo: '1',
    storageLocation: {
      id: `loc-${summary.storageLocationCode}`,
      type: 'regal',
      code: summary.storageLocationCode,
      barcode: summary.storageLocationCode,
      active: true,
    },
    section: caseSection(summary.section),
    priorityFlags: casePriorityFlags(summary.priorityFlags),
    totalQuantity: summary.totalQuantity,
    status: caseStatus(summary.status),
    effortPoints: 0,
    estimatedMinutes: summary.estimatedMinutes,
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

/**
 * Build domain positions from the DTO, mapping the real SKU lines (EAN/size/
 * quantity) it carries. Multiple positions and multiple SKU lines per position
 * are handled dynamically; a position without SKU lines maps to an empty list.
 */
function toPositions(caseId: string, dtos: ReceiptPositionDto[]): ReceiptPosition[] {
  return dtos.map((dto) => {
    const skuDtos =
      (dto as { skuLines?: Array<{ id?: string; ean?: string; size?: string; expectedQuantity?: number }> })
        .skuLines ?? [];
    return {
      id: dto.id,
      caseId,
      positionNo: dto.positionNo,
      wgr: dto.wgr,
      supplierArticleNo: dto.supplierArticleNo,
      supplierColor: dto.supplierColor,
      branchNo: dto.branchNo,
      shopNo: dto.shopNo,
      floor: str(dto.floor),
      instruction: {
        priceLabelRequired: true,
        priceLabelAttachRequired: true,
        securityRequired: false,
        onlineHandlingRequired: false,
      },
      skuLines: skuDtos.map((s, i) => ({
        id: s.id ?? `${dto.id}-sku-${i + 1}`,
        receiptPositionId: dto.id,
        ean: s.ean ?? '',
        size: s.size ?? '',
        expectedQuantity: s.expectedQuantity ?? 0,
        status: 'open' as const,
      })),
      status: positionStatus(dto.status),
    };
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

/** Same-day sections (NOS=4, Extra=7, NOS-Nachorder=8) are worked first. */
const URGENT_SECTIONS = new Set([4, 7, 8]);

function goodsCategory(value: unknown): BelegListItem['goodsType'] {
  if (value === 'palette' || value === 'haengeware' || value === 'mixed' || value === 'regal') {
    return value;
  }
  return 'regal';
}

function isUrgent(summary: CaseSummaryDto): boolean {
  return (
    summary.priorityFlags.includes('prio') ||
    (typeof summary.section === 'number' && URGENT_SECTIONS.has(summary.section))
  );
}

/** Priority rank for the recommended sort order (lower = first). */
function prioRankFor(summary: CaseSummaryDto, index: number): number {
  return (isUrgent(summary) ? 0 : 100) + index;
}

/** Map the assigned case summaries onto the selectable Beleg list (no forced order). */
function toBelegList(cases: CaseSummaryDto[]): BelegListItem[] {
  return cases.map((c, i) => ({
    caseId: c.id,
    weBelegNo: c.weBelegNo,
    prioRank: prioRankFor(c, i),
    section: typeof c.section === 'number' ? c.section : null,
    storageLocationCode: c.storageLocationCode,
    goodsType: goodsCategory((c as { goodsType?: unknown }).goodsType),
    totalQuantity: c.totalQuantity,
    urgent: isUrgent(c),
  }));
}

function toDayContext(bundle: CurrentBundleDto | undefined, employeeName: string): DayContext {
  return {
    id: 'today',
    employeeName,
    workstation: DEFAULT_WORKSTATION,
    plannedStart: DEFAULT_PLANNED_START,
    plannedEnd: DEFAULT_PLANNED_END,
    estimatedMinutes: bundle?.plannedEffortMinutes ?? 0,
  };
}

function toCaseAggregate(dto: CaseAggregateDto): CaseAggregate {
  const caseId = dto.case.id;
  return {
    caseId,
    case: toGoodsReceiptCase(dto.case),
    workInstruction: toWorkInstruction(caseId, dto.workInstruction),
    positions: toPositions(caseId, dto.positions),
    boxTargets: toBoxTargets(caseId, dto.boxTargets),
  };
}

export interface LoadResult {
  caseCount: number;
}

/**
 * Fetch today's assigned bundle for the current employee and mirror it into
 * Dexie. Clears any previously-cached bundle/aggregates first (idempotent);
 * preserves an existing CaseProgress so in-progress work is not reset.
 */
export async function loadAssignedWork(db: PaketDb = defaultDb): Promise<LoadResult> {
  const api = getApiClient();
  const session = getSession();

  const { data: today, error } = await api.GET('/api/me/today');
  if (error || !today) {
    throw new Error('Tagesdaten konnten nicht geladen werden');
  }

  // Idempotent reset of cached work scope (progress is preserved below).
  await db.day.clear();
  await db.belege.clear();
  await db.aggregates.clear();

  await putDay(toDayContext(today.bundle ?? undefined, session.displayName), db);

  if (!today.cases.length) {
    return { caseCount: 0 };
  }

  await putBelege(toBelegList(today.cases), db);

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
