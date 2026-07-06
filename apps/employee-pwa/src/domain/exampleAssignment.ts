/**
 * Synthetic seed = one engine-assigned bundle for the offline-demo pilot. It
 * mirrors what GET /api/me/today returns: a bundle context, a route-ordered
 * pick list and per-Beleg aggregates (case + work instruction + positions +
 * SKU lines incl. EK/VK prices + box targets + Online-Größen-Markierung). The
 * anchor Beleg is the Anhang G example (WE 3.656.860); the default scenario
 * mixes Regal + Hängebahn + Palette in one Bündel (Dustin A1) so all
 * Lagerplatz-Art icons and variants show up.
 *
 * Every record is validated through the shared Zod schemas so the fixture
 * cannot drift from the domain contract. Field mapping follows §G.1/§G.4.
 */
import {
  DEFAULT_INSPECTION_LEVELS,
  deriveOnlineSizeMarks,
  deriveWorkInstructionPoints,
  goodsReceiptCaseSchema,
  receiptPositionSchema,
  transportBoxTargetSchema,
  workInstructionHeaderSchema,
  type GoodsReceiptCase,
  type GoodsTypeText,
  type InspectionLevelCode,
  type OnlineSizeMark,
  type ReceiptPosition,
  type StorageLocation,
  type TransportBoxTarget,
  type WorkInstructionHeader,
} from '@paket/domain-types';
import type {
  BelegListItem,
  BundleContext,
  CaseAggregate,
  CollectStop,
  GoodsCategory,
} from '../db/types.js';
import { buildCollectStops } from '../db/collectStops.js';

export const EXAMPLE_CASE_ID = 'case-we-3656860';
const CASE_2_ID = 'case-we-3656861';
const CASE_3_ID = 'case-we-3656862';
export const EXAMPLE_DATE = '2026-06-15';

/** Demo-Präferenzen für die Rot/Grün-Online-Markierung (A8), wgr → Präferenz. */
const DEMO_ONLINE_PREFS: Record<string, { preferredSize: string; alternativeSize?: string }> = {
  '210300': { preferredSize: 'M', alternativeSize: 'L' },
  '218110': { preferredSize: '9', alternativeSize: '8' },
};

export interface SkuSpec {
  ean: string;
  size: string;
  quantity: number;
  ekPrice?: number;
  vkPrice?: number;
  vkLabelPrice?: number;
}

export interface PositionSpec {
  positionNo: number;
  supplierArticleNo: string;
  supplierColor: string;
  wgr: string;
  /** NOS (Never Out of Stock) article — shown as a per-position badge. */
  nosFlag?: boolean;
  /** Saison code (part of the article identity / Warenbezeichnung). */
  season?: string;
  /** CatMan-Kennzeichen (Anzeige, kein Prioritätstreiber). */
  catMan?: boolean;
  /** Ziel-Shop der Position (D3). */
  shopNo?: string;
  priceLabelAttachLocation?: string;
  securityRequired?: boolean;
  securityLocation?: string;
  /** Sicherungstyp-Piktogramm-Code (Backend-Asset /static/pictograms/<code>.svg). */
  securityTypeCode?: string;
  onlineRelevant?: boolean;
  onlineHandlingRequired?: boolean;
  onlineHandlingLocation?: string;
  redPriceRequired?: boolean;
  notes?: string;
  skus: SkuSpec[];
}

export interface WorkInstructionOverride {
  goodsReceiptCheckMode?: WorkInstructionHeader['goodsReceiptCheckMode'];
  goodsReceiptCheckPercentage?: number;
  inspectionLevelCode?: InspectionLevelCode;
  priceLabelPrintRequired?: boolean;
}

function buildWorkInstruction(caseId: string, over: WorkInstructionOverride = {}): WorkInstructionHeader {
  return workInstructionHeaderSchema.parse({
    caseId,
    priceLabelPrintRequired: true,
    sortByArticleColorSizeRequired: true,
    goodsReceiptCheckMode: 'quantity_only', // "Prüfung WE = Nein" → never none (§G.1)
    inspectionLevelCode: 'none',
    minimumQuantityCheckAlwaysRequired: true,
    boxLabelRequired: true,
    zstRequired: true,
    ...over,
  });
}

function buildPositions(caseId: string, weShort: string, specs: PositionSpec[]): ReceiptPosition[] {
  return specs.map((spec) => {
    const positionId = `pos-${weShort}-${spec.positionNo}`;
    return receiptPositionSchema.parse({
      id: positionId,
      caseId,
      positionNo: spec.positionNo,
      wgr: spec.wgr,
      supplierArticleNo: spec.supplierArticleNo,
      supplierColor: spec.supplierColor,
      season: spec.season,
      nosFlag: spec.nosFlag ?? false,
      catMan: spec.catMan ?? false,
      branchNo: '1',
      shopNo: spec.shopNo ?? '2143',
      hShopNo: '210',
      floor: 'EG',
      onlineRelevant: spec.onlineRelevant ?? spec.onlineHandlingRequired ?? false,
      instruction: {
        priceLabelRequired: true,
        priceLabelAttachRequired: true, // §G.1 Punkt 8
        priceLabelAttachLocation: spec.priceLabelAttachLocation,
        securityRequired: spec.securityRequired ?? false, // §G.1 Punkt 10
        securityLocation: spec.securityLocation,
        securityTypeCode: spec.securityTypeCode,
        onlineHandlingRequired: spec.onlineHandlingRequired ?? false,
        onlineHandlingLocation: spec.onlineHandlingLocation,
        redPriceRequired: spec.redPriceRequired ?? false,
        notes: spec.notes,
      },
      skuLines: spec.skus.map((sku, i) => ({
        id: `sku-${weShort}-${spec.positionNo}-${i + 1}`,
        receiptPositionId: positionId,
        ean: sku.ean,
        size: sku.size,
        expectedQuantity: sku.quantity,
        ekPrice: sku.ekPrice ?? 12.5,
        vkPrice: sku.vkPrice ?? 29.99,
        vkLabelPrice: sku.vkLabelPrice ?? sku.vkPrice ?? 29.99,
        status: 'open',
      })),
      status: 'open',
    });
  });
}

interface CaseHeaderSpec {
  section?: GoodsReceiptCase['section'];
  goodsTypeText?: GoodsTypeText;
  inboundCartonCount?: number;
  primaryShopNo?: string;
}

function buildCase(
  id: string,
  weBelegNo: string,
  locationCode: string,
  totalQuantity: number,
  locationType: StorageLocation['type'] = 'regal',
  header: CaseHeaderSpec = {},
): GoodsReceiptCase {
  return goodsReceiptCaseSchema.parse({
    id,
    source: 'prohandel_api',
    externalRef: `ph-${weBelegNo}`,
    weBelegNo,
    deliveryNoteNo: '1',
    bookingDate: EXAMPLE_DATE,
    branchNo: '1',
    primaryShopAreaNo: '21',
    primaryShopNo: header.primaryShopNo ?? '2143',
    primaryFloor: 'EG',
    inboundCartonCount: header.inboundCartonCount ?? 1,
    storageLocation: {
      id: `loc-${locationCode}`,
      type: locationType,
      code: locationCode,
      zone: 'Shopbereich 21',
      barcode: locationCode,
      active: true,
    },
    section: header.section ?? null,
    goodsTypeText: header.goodsTypeText ?? 'Vororder',
    priorityFlags: [],
    totalQuantity,
    status: 'assigned',
    effortPoints: 6,
    estimatedMinutes: 14,
    version: 0,
  });
}

function buildBox(
  caseId: string,
  weShort: string,
  positionIds: string[],
  quantity: number,
): TransportBoxTarget {
  return transportBoxTargetSchema.parse({
    id: `box-${weShort}-1`,
    caseId,
    branchNo: '1',
    shopAreaNo: '21',
    shopNo: '2143',
    hShopNo: '210',
    floor: 'EG',
    goodsType: 'vororder',
    positionIds,
    plannedQuantity: quantity,
    labelStatus: 'pending',
  });
}

/** A8 mock: apply the demo online-size preferences the way the backend does. */
function buildOnlineMarks(positions: readonly ReceiptPosition[]): Record<string, OnlineSizeMark> {
  const marks: Record<string, OnlineSizeMark> = {};
  for (const pos of positions) {
    if (pos.onlineRelevant !== true) continue;
    const pref = DEMO_ONLINE_PREFS[pos.wgr];
    const bySize = deriveOnlineSizeMarks(
      pos.skuLines.map((s) => s.size),
      pref ? [pref] : [],
    );
    for (const sku of pos.skuLines) {
      const mark = bySize[sku.size];
      if (mark) marks[sku.id] = mark;
    }
  }
  return marks;
}

/** Prüfstufen-Label + Aufgabentext aus dem Katalog (wie der Backend-Mapper). */
function inspectionTexts(wi: WorkInstructionHeader): {
  inspectionLevelLabel?: string;
  inspectionDescription?: string;
} {
  const level = DEFAULT_INSPECTION_LEVELS.find((l) => l.code === wi.inspectionLevelCode);
  return { inspectionLevelLabel: level?.label, inspectionDescription: level?.description };
}

// --- Reusable scenario builder (powers the demo-scenario catalog) ------------

export interface DemoCaseSpec {
  id: string;
  weBelegNo: string;
  /** Short id used to namespace position/SKU/box ids. */
  weShort: string;
  locationCode: string;
  locationType?: StorageLocation['type'];
  goodsType: GoodsCategory;
  totalQuantity: number;
  /** Verladesektion (Abschnitt 1/2/3/4/7/8), null = nur Prio/keine. */
  section?: GoodsReceiptCase['section'];
  /** Warenart (GoodsTypeText) — Beleg-Kopf-Order-Typ (Vororder/Nachorder/NOS/EB …). */
  goodsTypeText?: GoodsTypeText;
  /** Anzahl Kartons der Anlieferung (C2: Mehr-Karton-Sendungen suchen!). */
  inboundCartonCount?: number;
  primaryShopNo?: string;
  wi?: WorkInstructionOverride;
  positions: PositionSpec[];
}

/** Build one full Beleg aggregate (case + WI + positions + box + derived AW points). */
export function buildCaseAggregate(spec: DemoCaseSpec): CaseAggregate {
  const positions = buildPositions(spec.id, spec.weShort, spec.positions);
  const wi = buildWorkInstruction(spec.id, spec.wi ?? {});
  return {
    caseId: spec.id,
    case: buildCase(spec.id, spec.weBelegNo, spec.locationCode, spec.totalQuantity, spec.locationType ?? 'regal', {
      section: spec.section ?? null,
      goodsTypeText: spec.goodsTypeText ?? 'Vororder',
      inboundCartonCount: spec.inboundCartonCount,
      primaryShopNo: spec.primaryShopNo,
    }),
    workInstruction: wi,
    positions,
    boxTargets: [
      buildBox(
        spec.id,
        spec.weShort,
        positions.map((p) => p.id),
        spec.totalQuantity,
      ),
    ],
    instructionPoints: deriveWorkInstructionPoints(wi, positions),
    onlineMarks: buildOnlineMarks(positions),
    ...inspectionTexts(wi),
  };
}

export interface AssembledScenario {
  bundle: BundleContext;
  collectStops: CollectStop[];
  belege: BelegListItem[];
  aggregates: CaseAggregate[];
}

export interface ScenarioInput {
  bundleId: string;
  employeeName: string;
  bereich: string;
  cases: DemoCaseSpec[];
}

/** Assemble a full offline scenario (bundle + route-ordered stops + belege + aggregates). */
export function assembleScenario(input: ScenarioInput): AssembledScenario {
  const aggregates = input.cases.map((c) => buildCaseAggregate(c));
  const belege: BelegListItem[] = aggregates.map((a, order) => ({
    caseId: a.caseId,
    weBelegNo: a.case.weBelegNo,
    order,
    storageLocationCode: a.case.storageLocation?.code ?? 'unbekannt',
    goodsType: input.cases[order]?.goodsType ?? 'regal',
    totalQuantity: a.case.totalQuantity,
    goodsTypeText: a.case.goodsTypeText,
    priceLabelPrintRequired: a.workInstruction.priceLabelPrintRequired,
  }));
  const collectStops = buildCollectStops(
    [],
    aggregates.map((a) => ({
      caseId: a.caseId,
      storageLocationCode: a.case.storageLocation?.code ?? 'unbekannt',
    })),
  );
  const bundle: BundleContext = {
    id: 'today',
    bundleId: input.bundleId,
    employeeName: input.employeeName,
    date: EXAMPLE_DATE,
    plannedEffortMinutes: aggregates.reduce((sum, a) => sum + a.case.estimatedMinutes, 0),
    bereich: input.bereich,
    caseIds: aggregates.map((a) => a.caseId),
  };
  return { bundle, collectStops, belege, aggregates };
}

// --- Standard-Szenario: gemischtes Bündel Regal + Hängebahn + Palette (A1) ---

/** Case 1: the Anhang G multi-position Beleg (WE 3.656.860) at R27, Regal. */
const case1Spec: DemoCaseSpec = {
  id: EXAMPLE_CASE_ID,
  weBelegNo: '3656860',
  weShort: '3656860',
  locationCode: 'R27',
  locationType: 'regal',
  goodsType: 'regal',
  totalQuantity: 9,
  section: 1,
  goodsTypeText: 'Vororder',
  inboundCartonCount: 3,
  wi: { inspectionLevelCode: 'none' },
  positions: [
    {
      positionNo: 1,
      supplierArticleNo: '411005-CAMAL-Z bike glove man',
      supplierColor: '12183-black.white fog',
      wgr: '218110',
      nosFlag: true, // NOS-Artikel
      season: 'NOS',
      catMan: true,
      priceLabelAttachLocation: 'Am Bund / Innenetikett',
      skus: [{ ean: '4068657016108', size: '8', quantity: 1, ekPrice: 14.2, vkPrice: 34.99 }],
    },
    {
      positionNo: 2,
      supplierArticleNo: '411006-CAMAL-Z bike glove man',
      supplierColor: '12183-black.white fog',
      wgr: '218110',
      redPriceRequired: true, // Rotpreis badge
      skus: [
        { ean: '4068657016207', size: '9', quantity: 1, ekPrice: 14.2, vkPrice: 34.99, vkLabelPrice: 24.99 },
      ],
    },
    {
      positionNo: 3,
      supplierArticleNo: '411007-CAMAL-Z bike glove man',
      supplierColor: '12183-black.white fog',
      wgr: '218110',
      onlineRelevant: true, // A8: Rot/Grün-Markierung der Größen
      skus: [
        { ean: '4068657016306', size: '8', quantity: 1 },
        { ean: '4068657016276', size: '9', quantity: 1 },
        { ean: '4068657016368', size: '10,5', quantity: 1 },
      ],
    },
    {
      positionNo: 4,
      supplierArticleNo: '411008-CAMAL-Z bike glove man',
      supplierColor: '12183-black.white fog',
      wgr: '218110',
      skus: [{ ean: '4068657016405', size: '10', quantity: 2 }],
    },
    {
      positionNo: 5,
      supplierArticleNo: '411009-CAMAL-Z bike glove man',
      supplierColor: '12183-black.white fog',
      wgr: '218110',
      skus: [{ ean: '4068657016504', size: '11', quantity: 2 }],
    },
  ],
};

/** Case 2: Hängebahn-Beleg mit Sicherung (Piktogramm) at HB-3. */
const case2Spec: DemoCaseSpec = {
  id: CASE_2_ID,
  weBelegNo: '3656861',
  weShort: '3656861',
  locationCode: 'HB-3',
  locationType: 'haengebahn',
  goodsType: 'haengeware',
  totalQuantity: 4,
  goodsTypeText: 'NOS',
  inboundCartonCount: 1,
  positions: [
    {
      positionNo: 1,
      supplierArticleNo: '820100-Wollmantel',
      supplierColor: '90010-anthrazit',
      wgr: '415210',
      securityRequired: true, // Sicherung badge + Piktogramm
      securityLocation: 'Ärmelsaum',
      securityTypeCode: 'hard-tag',
      notes: 'Empfindlich – vorsichtig auspacken',
      skus: [
        { ean: '4068657020101', size: '38', quantity: 2, ekPrice: 89, vkPrice: 199 },
        { ean: '4068657020118', size: '40', quantity: 2, ekPrice: 89, vkPrice: 199 },
      ],
    },
  ],
};

/** Case 3: Paletten-Beleg mit Online-Handling + Stichprobe at P-2. */
const case3Spec: DemoCaseSpec = {
  id: CASE_3_ID,
  weBelegNo: '3656862',
  weShort: '3656862',
  locationCode: 'P-2',
  locationType: 'palette',
  goodsType: 'palette',
  totalQuantity: 4,
  goodsTypeText: 'Extrabestellung',
  inboundCartonCount: 2,
  wi: {
    goodsReceiptCheckMode: 'percentage_check',
    goodsReceiptCheckPercentage: 20,
    inspectionLevelCode: 'p20',
  },
  positions: [
    {
      positionNo: 1,
      supplierArticleNo: '770450-Rain jacket',
      supplierColor: '40520-deep navy',
      wgr: '210300',
      onlineRelevant: true,
      onlineHandlingRequired: true, // Online badge
      onlineHandlingLocation: 'Online-Tisch B',
      skus: [{ ean: '4068657030045', size: 'M', quantity: 2, ekPrice: 41, vkPrice: 99.95 }],
    },
    {
      positionNo: 2,
      supplierArticleNo: '770451-Rain jacket',
      supplierColor: '40520-deep navy',
      wgr: '210300',
      skus: [{ ean: '4068657030052', size: 'L', quantity: 2, ekPrice: 41, vkPrice: 99.95 }],
    },
  ],
};

export const EXAMPLE_SCENARIO_INPUT: ScenarioInput = {
  bundleId: 'bundle-2026-06-15-00',
  employeeName: 'Anna',
  bereich: 'Gemischt',
  cases: [case1Spec, case2Spec, case3Spec],
};

const assembled = assembleScenario(EXAMPLE_SCENARIO_INPUT);

/** All Beleg aggregates of the demo bundle, in bundle order. */
export const exampleAggregates: CaseAggregate[] = assembled.aggregates;

/** Primary multi-position aggregate (used by the unit tests). */
export const exampleAggregate: CaseAggregate = assembled.aggregates[0]!;

export const exampleBundle: BundleContext = assembled.bundle;
export const exampleBelegList: BelegListItem[] = assembled.belege;

/** Route-ordered consolidated pick list: HB-3, P-2, R27 (deterministic fallback order). */
export const exampleCollectStops: CollectStop[] = assembled.collectStops;
