/**
 * Synthetic seed = the Anhang G example beleg (WE 3.656.860), translated into
 * the offline aggregate. This is the "already-assigned package" the pilot works
 * end-to-end. Every record is validated through the shared Zod schemas so the
 * fixture cannot drift from the domain contract.
 *
 * Field mapping follows §G.1 / §G.4 exactly:
 *  - Preisetikettendruck = Ja  -> priceLabelPrintRequired
 *  - Sortieren = Ja            -> sortByArticleColorSizeRequired
 *  - Prüfung WE = Nein         -> goodsReceiptCheckMode 'quantity_only' (never none)
 *  - Etikett anbringen Pos 1-5 -> priceLabelAttachRequired
 *  - Nicht sichern Pos 1-5     -> securityRequired = false
 *  - Boxzettel = Ja            -> boxLabelRequired
 *  - ZST = Ja                  -> zstRequired
 */
import {
  goodsReceiptCaseSchema,
  receiptPositionSchema,
  transportBoxTargetSchema,
  workInstructionHeaderSchema,
  type GoodsReceiptCase,
  type ReceiptPosition,
  type TransportBoxTarget,
  type WorkInstructionHeader,
} from '@paket/domain-types';
import type { BelegListItem, CaseAggregate, DayContext } from '../db/types.js';

export const EXAMPLE_CASE_ID = 'case-we-3656860';

const exampleCase: GoodsReceiptCase = goodsReceiptCaseSchema.parse({
  id: EXAMPLE_CASE_ID,
  documentSetId: 'ds-we-3656860',
  weBelegNo: '3656860',
  deliveryNoteNo: '1',
  bookingDate: '2026-06-15',
  branchNo: '1',
  primaryShopAreaNo: '21',
  primaryFloor: 'EG',
  storageLocation: {
    id: 'loc-r27',
    type: 'regal',
    code: 'R27',
    zone: 'Shopbereich 21',
    barcode: 'R27',
    active: true,
  },
  section: null,
  goodsTypeText: 'Vororder',
  priorityFlags: [],
  totalQuantity: 9,
  status: 'assigned',
  effortPoints: 6,
  estimatedMinutes: 14,
  version: 0,
});

const exampleWorkInstruction: WorkInstructionHeader = workInstructionHeaderSchema.parse({
  caseId: EXAMPLE_CASE_ID,
  priceLabelPrintRequired: true,
  sortByArticleColorSizeRequired: true,
  goodsReceiptCheckMode: 'quantity_only',
  minimumQuantityCheckAlwaysRequired: true,
  boxLabelRequired: true,
  zstRequired: true,
});

interface PositionSpec {
  positionNo: number;
  supplierArticleNo: string;
  supplierColor: string;
  wgr: string;
  skus: Array<{ ean: string; size: string; quantity: number }>;
}

// Positions 1-5; quantities sum to the Belegmenge 9. Position 3 mirrors §9.6.
const positionSpecs: PositionSpec[] = [
  {
    positionNo: 1,
    supplierArticleNo: '411005-CAMAL-Z bike glove man',
    supplierColor: '12183-black.white fog',
    wgr: '218110',
    skus: [{ ean: '4068657016108', size: '8', quantity: 1 }],
  },
  {
    positionNo: 2,
    supplierArticleNo: '411006-CAMAL-Z bike glove man',
    supplierColor: '12183-black.white fog',
    wgr: '218110',
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
];

const examplePositions: ReceiptPosition[] = positionSpecs.map((spec) => {
  const positionId = `pos-3656860-${spec.positionNo}`;
  return receiptPositionSchema.parse({
    id: positionId,
    caseId: EXAMPLE_CASE_ID,
    positionNo: spec.positionNo,
    wgr: spec.wgr,
    supplierArticleNo: spec.supplierArticleNo,
    supplierColor: spec.supplierColor,
    nosFlag: false,
    branchNo: '1',
    shopNo: '2143',
    hShopNo: '210',
    floor: 'EG',
    onlineRelevant: false,
    instruction: {
      priceLabelRequired: true,
      priceLabelAttachRequired: true, // §G.1 Punkt 8: Etikett anbringen Pos 1-5
      securityRequired: false, // §G.1 Punkt 10: Nicht sichern Pos 1-5
      onlineHandlingRequired: false,
    },
    skuLines: spec.skus.map((sku, i) => ({
      id: `sku-3656860-${spec.positionNo}-${i + 1}`,
      receiptPositionId: positionId,
      ean: sku.ean,
      size: sku.size,
      expectedQuantity: sku.quantity,
      status: 'open',
    })),
    status: 'open',
  });
});

const exampleBox: TransportBoxTarget = transportBoxTargetSchema.parse({
  id: 'box-3656860-1',
  caseId: EXAMPLE_CASE_ID,
  branchNo: '1',
  shopAreaNo: '21',
  shopNo: '2143',
  hShopNo: '210',
  floor: 'EG',
  goodsType: 'vororder',
  positionIds: examplePositions.map((p) => p.id),
  plannedQuantity: 9,
  labelStatus: 'pending',
});

export const exampleAggregate: CaseAggregate = {
  caseId: EXAMPLE_CASE_ID,
  case: exampleCase,
  workInstruction: exampleWorkInstruction,
  positions: examplePositions,
  boxTargets: [exampleBox],
};

export const exampleDay: DayContext = {
  id: 'today',
  employeeName: 'Anna',
  workstation: 'Tisch 4',
  plannedStart: '09:00',
  plannedEnd: '16:00',
  estimatedMinutes: 14,
};

export const exampleBelegList: BelegListItem[] = [
  {
    caseId: EXAMPLE_CASE_ID,
    weBelegNo: '3656860',
    prioRank: 100,
    section: null,
    storageLocationCode: 'R27',
    goodsType: 'regal',
    totalQuantity: 9,
    urgent: false,
  },
];
