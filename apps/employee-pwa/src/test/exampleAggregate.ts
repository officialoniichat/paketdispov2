/**
 * Shared `CaseAggregate` test fixture for the pure workflow unit tests
 * (`workflowModel.test.ts`).
 *
 * The former `domain/exampleAssignment.ts` (deleted with the Dexie/offline-demo
 * scaffolding, see `bf3b7b3`) built this from a bigger scenario-assembly
 * pipeline shared with the offline-demo bootstrap. That pipeline is gone along
 * with the offline demo; only the anchor Beleg (Anhang G, WE 3.656.860) these
 * two test files actually assert against is reproduced here, as a plain
 * literal matching `CaseAggregate` (task-13).
 */
import type { CaseAggregate } from '../domain/types.js';

const CASE_ID = 'case-we-3656860';
const WE_BELEG_NO = '3656860';

export const exampleAggregate: CaseAggregate = {
  caseId: CASE_ID,
  case: {
    id: CASE_ID,
    source: 'prohandel_api',
    externalRef: `ph-${WE_BELEG_NO}`,
    weBelegNo: WE_BELEG_NO,
    deliveryNoteNo: '1',
    bookingDate: '2026-06-15',
    branchNo: '1',
    primaryShopAreaNo: '21',
    primaryShopNo: '2143',
    primaryFloor: 'EG',
    inboundCartonCount: 3,
    storageLocation: {
      id: 'loc-R27',
      type: 'regal',
      code: 'R27',
      zone: 'Shopbereich 21',
      barcode: 'R27',
      active: true,
    },
    section: 1,
    goodsTypeText: 'Vororder',
    priorityFlags: [],
    totalQuantity: 9,
    status: 'assigned',
    effortPoints: 6,
    estimatedMinutes: 14,
    attentionFlag: false,
    missingFields: [],
    deliveryGroupReleased: false,
    version: 0,
  },
  workInstruction: {
    caseId: CASE_ID,
    priceLabelPrintRequired: true,
    sortByArticleColorSizeRequired: true,
    goodsReceiptCheckMode: 'quantity_only', // "Prüfung WE = Nein" → never none (§G.1)
    inspectionLevelCode: 'none',
    minimumQuantityCheckAlwaysRequired: true,
    boxLabelRequired: true,
    zstRequired: true,
  },
  positions: [
    {
      id: 'pos-3656860-1',
      caseId: CASE_ID,
      positionNo: 1,
      wgr: '218110',
      supplierArticleNo: '411005-CAMAL-Z bike glove man',
      supplierColor: '12183-black.white fog',
      season: 'NOS',
      nosFlag: true,
      catMan: true,
      branchNo: '1',
      shopNo: '2143',
      instruction: {
        priceLabelRequired: true,
        priceLabelAttachRequired: true,
        priceLabelAttachLocation: 'Am Bund / Innenetikett',
        securityRequired: false,
        onlineHandlingRequired: false,
      },
      skuLines: [
        {
          id: 'sku-3656860-1-1',
          receiptPositionId: 'pos-3656860-1',
          ean: '4068657016108',
          size: '8',
          expectedQuantity: 1,
          ekPrice: 14.2,
          vkPrice: 34.99,
          status: 'open',
        },
      ],
      status: 'open',
    },
    {
      id: 'pos-3656860-2',
      caseId: CASE_ID,
      positionNo: 2,
      wgr: '218110',
      supplierArticleNo: '411006-CAMAL-Z bike glove man',
      supplierColor: '12183-black.white fog',
      branchNo: '1',
      shopNo: '2143',
      instruction: {
        priceLabelRequired: true,
        priceLabelAttachRequired: true,
        securityRequired: false,
        onlineHandlingRequired: false,
        redPriceRequired: true,
      },
      skuLines: [
        {
          id: 'sku-3656860-2-1',
          receiptPositionId: 'pos-3656860-2',
          ean: '4068657016207',
          size: '9',
          expectedQuantity: 1,
          ekPrice: 14.2,
          vkPrice: 34.99,
          vkLabelPrice: 24.99,
          status: 'open',
        },
      ],
      status: 'open',
    },
    {
      id: 'pos-3656860-3',
      caseId: CASE_ID,
      positionNo: 3,
      wgr: '218110',
      supplierArticleNo: '411007-CAMAL-Z bike glove man',
      supplierColor: '12183-black.white fog',
      onlineRelevant: true,
      branchNo: '1',
      shopNo: '2143',
      instruction: {
        priceLabelRequired: true,
        priceLabelAttachRequired: true,
        securityRequired: false,
        onlineHandlingRequired: false,
      },
      skuLines: [
        {
          id: 'sku-3656860-3-1',
          receiptPositionId: 'pos-3656860-3',
          ean: '4068657016306',
          size: '8',
          expectedQuantity: 1,
          status: 'open',
        },
        {
          id: 'sku-3656860-3-2',
          receiptPositionId: 'pos-3656860-3',
          ean: '4068657016276',
          size: '9',
          expectedQuantity: 1,
          status: 'open',
        },
        {
          id: 'sku-3656860-3-3',
          receiptPositionId: 'pos-3656860-3',
          ean: '4068657016368',
          size: '10,5',
          expectedQuantity: 1,
          status: 'open',
        },
      ],
      status: 'open',
    },
  ],
  boxTargets: [
    {
      id: 'box-3656860-1',
      caseId: CASE_ID,
      branchNo: '1',
      shopAreaNo: '21',
      shopNo: '2143',
      floor: 'EG',
      goodsType: 'vororder',
      positionIds: ['pos-3656860-1', 'pos-3656860-2', 'pos-3656860-3'],
      plannedQuantity: 9,
      labelStatus: 'pending',
    },
  ],
  instructionPoints: [],
  onlineMarks: {},
  inspectionLevelLabel: undefined,
  inspectionDescription: undefined,
};
