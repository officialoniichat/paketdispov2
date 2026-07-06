/**
 * Synthetic seed = one engine-assigned, Bereich-homogeneous (Regal) bundle for
 * the offline-demo pilot. It mirrors what GET /api/me/today returns: a bundle
 * context, a route-ordered collect list and per-Beleg aggregates (case + work
 * instruction + positions + SKU lines + box targets). The anchor Beleg is the
 * Anhang G example (WE 3.656.860); two more Belege give the COLLECT phase a
 * multi-location pick list and the PROCESS list more than one row.
 *
 * Every record is validated through the shared Zod schemas so the fixture
 * cannot drift from the domain contract. Field mapping follows §G.1/§G.4.
 */
import {
  deriveWorkInstructionPoints,
  goodsReceiptCaseSchema,
  receiptPositionSchema,
  transportBoxTargetSchema,
  workInstructionHeaderSchema,
  type GoodsReceiptCase,
  type GoodsTypeText,
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

export interface PositionSpec {
  positionNo: number;
  supplierArticleNo: string;
  supplierColor: string;
  wgr: string;
  /** NOS (Never Out of Stock) article — shown as a per-position badge. */
  nosFlag?: boolean;
  /** Saison code (part of the article identity / Warenbezeichnung). */
  season?: string;
  priceLabelAttachLocation?: string;
  securityRequired?: boolean;
  securityLocation?: string;
  onlineHandlingRequired?: boolean;
  onlineHandlingLocation?: string;
  redPriceRequired?: boolean;
  notes?: string;
  skus: Array<{ ean: string; size: string; quantity: number }>;
}

export interface WorkInstructionOverride {
  goodsReceiptCheckMode?: WorkInstructionHeader['goodsReceiptCheckMode'];
  goodsReceiptCheckPercentage?: number;
}

function buildWorkInstruction(caseId: string, over: WorkInstructionOverride = {}): WorkInstructionHeader {
  return workInstructionHeaderSchema.parse({
    caseId,
    priceLabelPrintRequired: true,
    sortByArticleColorSizeRequired: true,
    goodsReceiptCheckMode: 'quantity_only', // "Prüfung WE = Nein" → never none (§G.1)
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
      branchNo: '1',
      shopNo: '2143',
      hShopNo: '210',
      floor: 'EG',
      onlineRelevant: spec.onlineHandlingRequired ?? false,
      instruction: {
        priceLabelRequired: true,
        priceLabelAttachRequired: true, // §G.1 Punkt 8
        priceLabelAttachLocation: spec.priceLabelAttachLocation,
        securityRequired: spec.securityRequired ?? false, // §G.1 Punkt 10
        securityLocation: spec.securityLocation,
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
        status: 'open',
      })),
      status: 'open',
    });
  });
}

function buildCase(
  id: string,
  weBelegNo: string,
  locationCode: string,
  totalQuantity: number,
  locationType: StorageLocation['type'] = 'regal',
  section: GoodsReceiptCase['section'] = null,
  goodsTypeText: GoodsTypeText = 'Vororder',
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
    primaryFloor: 'EG',
    storageLocation: {
      id: `loc-${locationCode}`,
      type: locationType,
      code: locationCode,
      zone: 'Shopbereich 21',
      barcode: locationCode,
      active: true,
    },
    section,
    goodsTypeText,
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

// --- Case 1: the Anhang G multi-position Beleg (WE 3.656.860) at R27 ---------
const case1Positions = buildPositions(EXAMPLE_CASE_ID, '3656860', [
  {
    positionNo: 1,
    supplierArticleNo: '411005-CAMAL-Z bike glove man',
    supplierColor: '12183-black.white fog',
    wgr: '218110',
    nosFlag: true, // NOS-Artikel
    season: 'NOS',
    priceLabelAttachLocation: 'Am Bund / Innenetikett',
    skus: [{ ean: '4068657016108', size: '8', quantity: 1 }],
  },
  {
    positionNo: 2,
    supplierArticleNo: '411006-CAMAL-Z bike glove man',
    supplierColor: '12183-black.white fog',
    wgr: '218110',
    redPriceRequired: true, // Rotpreis badge
    skus: [{ ean: '4068657016207', size: '9', quantity: 1 }],
  },
  {
    positionNo: 3,
    supplierArticleNo: '411007-CAMAL-Z bike glove man',
    supplierColor: '12183-black.white fog',
    wgr: '218110',
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
]);

const case1Wi = buildWorkInstruction(EXAMPLE_CASE_ID);
const case1: CaseAggregate = {
  caseId: EXAMPLE_CASE_ID,
  case: buildCase(EXAMPLE_CASE_ID, '3656860', 'R27', 9, 'regal', 1),
  workInstruction: case1Wi,
  positions: case1Positions,
  boxTargets: [buildBox(EXAMPLE_CASE_ID, '3656860', case1Positions.map((p) => p.id), 9)],
  instructionPoints: deriveWorkInstructionPoints(case1Wi, case1Positions),
};

// --- Case 2: a small single-position Beleg, also at R27 ----------------------
const case2Positions = buildPositions(CASE_2_ID, '3656861', [
  {
    positionNo: 1,
    supplierArticleNo: '550120-Trail running sock',
    supplierColor: '00010-black',
    wgr: '219050',
    securityRequired: true, // Sicherung badge
    securityLocation: 'Sicherungsnaht innen',
    notes: 'Empfindlich – vorsichtig auspacken',
    skus: [{ ean: '4068657020101', size: '39-42', quantity: 4 }],
  },
]);

const case2Wi = buildWorkInstruction(CASE_2_ID);
const case2: CaseAggregate = {
  caseId: CASE_2_ID,
  case: buildCase(CASE_2_ID, '3656861', 'R27', 4),
  workInstruction: case2Wi,
  positions: case2Positions,
  boxTargets: [buildBox(CASE_2_ID, '3656861', case2Positions.map((p) => p.id), 4)],
  instructionPoints: deriveWorkInstructionPoints(case2Wi, case2Positions),
};

// --- Case 3: two positions at A-4, with online handling ----------------------
const case3Positions = buildPositions(CASE_3_ID, '3656862', [
  {
    positionNo: 1,
    supplierArticleNo: '770450-Rain jacket',
    supplierColor: '40520-deep navy',
    wgr: '210300',
    onlineHandlingRequired: true, // Online badge (wiring is a sibling task)
    onlineHandlingLocation: 'Online-Tisch B',
    skus: [{ ean: '4068657030045', size: 'M', quantity: 2 }],
  },
  {
    positionNo: 2,
    supplierArticleNo: '770451-Rain jacket',
    supplierColor: '40520-deep navy',
    wgr: '210300',
    skus: [{ ean: '4068657030052', size: 'L', quantity: 2 }],
  },
]);

// Case 3 demonstrates the Prüfung-Stichprobe (%) header variant.
const case3Wi = buildWorkInstruction(CASE_3_ID, {
  goodsReceiptCheckMode: 'percentage_check',
  goodsReceiptCheckPercentage: 20,
});
const case3: CaseAggregate = {
  caseId: CASE_3_ID,
  case: buildCase(CASE_3_ID, '3656862', 'A-4', 4),
  workInstruction: case3Wi,
  positions: case3Positions,
  boxTargets: [buildBox(CASE_3_ID, '3656862', case3Positions.map((p) => p.id), 4)],
  instructionPoints: deriveWorkInstructionPoints(case3Wi, case3Positions),
};

/** All Beleg aggregates of the demo bundle, in bundle order. */
export const exampleAggregates: CaseAggregate[] = [case1, case2, case3];

/** Primary multi-position aggregate (used by the unit tests). */
export const exampleAggregate: CaseAggregate = case1;

export const exampleBundle: BundleContext = {
  id: 'today',
  bundleId: 'bundle-2026-06-15-00',
  employeeName: 'Anna',
  workstation: 'Tisch 4',
  date: EXAMPLE_DATE,
  plannedEffortMinutes: 34,
  bereich: 'Regal',
  caseIds: exampleAggregates.map((a) => a.caseId),
};

export const exampleBelegList: BelegListItem[] = exampleAggregates.map((a, order) => ({
  caseId: a.caseId,
  weBelegNo: a.case.weBelegNo,
  order,
  storageLocationCode: a.case.storageLocation?.code ?? 'unbekannt',
  goodsType: 'regal',
  totalQuantity: a.case.totalQuantity,
}));

/** Route-ordered consolidated pick list: R27 (two Belege) then A-4. */
export const exampleCollectStops: CollectStop[] = [
  { sequence: 0, locationCode: 'R27', scanRequired: false, caseIds: [EXAMPLE_CASE_ID, CASE_2_ID] },
  { sequence: 1, locationCode: 'A-4', scanRequired: false, caseIds: [CASE_3_ID] },
];

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
  /** Warenart (GoodsTypeText) — Beleg-Kopf-Order-Typ. */
  goodsTypeText?: GoodsTypeText;
  wi?: WorkInstructionOverride;
  positions: PositionSpec[];
}

/** Build one full Beleg aggregate (case + WI + positions + box + derived AW points). */
export function buildCaseAggregate(spec: DemoCaseSpec): CaseAggregate {
  const positions = buildPositions(spec.id, spec.weShort, spec.positions);
  const wi = buildWorkInstruction(spec.id, spec.wi ?? {});
  return {
    caseId: spec.id,
    case: buildCase(
      spec.id,
      spec.weBelegNo,
      spec.locationCode,
      spec.totalQuantity,
      spec.locationType ?? 'regal',
      spec.section ?? null,
      spec.goodsTypeText ?? 'Vororder',
    ),
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
  workstation: string;
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
    workstation: input.workstation,
    date: EXAMPLE_DATE,
    plannedEffortMinutes: aggregates.reduce((sum, a) => sum + a.case.estimatedMinutes, 0),
    bereich: input.bereich,
    caseIds: aggregates.map((a) => a.caseId),
  };
  return { bundle, collectStops, belege, aggregates };
}
