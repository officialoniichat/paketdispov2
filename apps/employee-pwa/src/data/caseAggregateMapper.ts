/**
 * Adapter: `/api/me/cases/{caseId}/aggregate`'s `CaseAggregateDto` (backend
 * wire shape, see `packages/api-client/src/generated/schema.ts`) → the app's
 * `CaseAggregate` (`domain/types.ts`), the shape `useCaseFlow`/the screens
 * (`BelegProcessScreen`, `ProblemMeldenScreen`) already consume.
 *
 * The two shapes are close but not 1:1 (see `domain/types.ts`'s module doc):
 * - `CaseAggregateDto.case` is the shallower `CaseSummaryDto`, not the full
 *   `GoodsReceiptCase` — the handful of `GoodsReceiptCase` fields neither
 *   screen ever reads (source/externalRef/deliveryNoteNo/primaryShopAreaNo/
 *   primaryFloor/catManDate/loadPlanDate/effortPoints/version/
 *   assignedBundleId/deliveryGroupReleased) are filled with inert placeholders
 *   below (TODO(task-13+): drop the placeholders if a screen ever needs the
 *   real values — the backend would need to add them to `CaseSummaryDto` first).
 * - `onlineMarks` is per-SKU-line on the DTO (`SkuLineDto.onlineMark`) rather
 *   than a separate top-level map — this rebuilds the map instead of mocking
 *   it, since the real data is present, just shaped differently.
 * - `workInstruction` is optional/nullable on the DTO (an active, assigned
 *   case always has one per the backend's own invariants); a defensive
 *   all-`false` fallback is used for the type-theoretical null case rather
 *   than throwing, so a UI still renders instead of crashing.
 */
import type { components } from '@paket/api-client';
import type {
  CaseStatus,
  CheckMode,
  GoodsTypeText,
  LocationType,
  OnlineSizeMark,
  PositionInstruction,
  PriorityFlag,
  ReceiptPosition,
  SectionCode,
  TransportBoxTarget,
  WorkInstructionHeader,
  WorkInstructionPoint,
} from '@paket/domain-types';
import type { CaseAggregate } from '../domain/types.js';

type CaseAggregateDto = components['schemas']['CaseAggregateDto'];
type ReceiptPositionDto = components['schemas']['ReceiptPositionDto'];
type TransportBoxTargetDto = components['schemas']['TransportBoxTargetDto'];
type WorkInstructionHeaderDto = components['schemas']['WorkInstructionHeaderDto'];
type WorkInstructionPointDto = components['schemas']['WorkInstructionPointDto'];

const FALLBACK_INSTRUCTION: PositionInstruction = {
  priceLabelRequired: false,
  priceLabelAttachRequired: false,
  securityRequired: false,
  onlineHandlingRequired: false,
};

function mapWorkInstruction(caseId: string, dto: WorkInstructionHeaderDto | null | undefined): WorkInstructionHeader {
  if (!dto) {
    // Defensive only: the backend never omits this for an assigned case.
    return {
      caseId,
      priceLabelPrintRequired: false,
      sortByArticleColorSizeRequired: false,
      goodsReceiptCheckMode: 'quantity_only',
      minimumQuantityCheckAlwaysRequired: true,
      boxLabelRequired: false,
      zstRequired: false,
    };
  }
  return {
    caseId,
    priceLabelPrintRequired: dto.priceLabelPrintRequired,
    sortByArticleColorSizeRequired: dto.sortByArticleColorSizeRequired,
    goodsReceiptCheckMode: dto.goodsReceiptCheckMode as CheckMode,
    goodsReceiptCheckPercentage: dto.goodsReceiptCheckPercentage ?? undefined,
    inspectionLevelCode: (dto.inspectionLevelCode ?? undefined) as WorkInstructionHeader['inspectionLevelCode'],
    minimumQuantityCheckAlwaysRequired: true,
    boxLabelRequired: dto.boxLabelRequired,
    zstRequired: dto.zstRequired,
  };
}

function mapPosition(caseId: string, dto: ReceiptPositionDto): ReceiptPosition {
  const instruction: PositionInstruction = dto.instruction
    ? {
        priceLabelRequired: dto.instruction.priceLabelRequired,
        priceLabelAttachRequired: dto.instruction.priceLabelAttachRequired,
        priceLabelAttachLocation: dto.instruction.priceLabelAttachLocation ?? undefined,
        securityRequired: dto.instruction.securityRequired,
        securityLocation: dto.instruction.securityLocation ?? undefined,
        securityTypeCode: dto.instruction.securityTypeCode ?? undefined,
        onlineHandlingRequired: dto.instruction.onlineHandlingRequired,
        onlineHandlingLocation: dto.instruction.onlineHandlingLocation ?? undefined,
        redPriceRequired: dto.instruction.redPriceRequired ?? undefined,
        notes: dto.instruction.notes ?? undefined,
      }
    : FALLBACK_INSTRUCTION;
  return {
    id: dto.id,
    caseId,
    positionNo: dto.positionNo,
    wgr: dto.wgr,
    supplierArticleNo: dto.supplierArticleNo,
    supplierColor: dto.supplierColor,
    season: dto.season ?? undefined,
    nosFlag: dto.nosFlag ?? undefined,
    branchNo: dto.branchNo,
    shopNo: dto.shopNo,
    floor: dto.floor ?? undefined,
    catMan: dto.catMan ?? undefined,
    instruction,
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
      status: s.status as ReceiptPosition['skuLines'][number]['status'],
    })),
    status: dto.status as ReceiptPosition['status'],
  };
}

function mapBoxTarget(caseId: string, dto: TransportBoxTargetDto): TransportBoxTarget {
  return {
    id: dto.id,
    caseId,
    branchNo: dto.branchNo,
    shopAreaNo: dto.shopAreaNo,
    shopNo: dto.shopNo ?? undefined,
    floor: dto.floor ?? undefined,
    goodsType: (dto.goodsType ?? 'mixed') as TransportBoxTarget['goodsType'],
    positionIds: dto.positionIds,
    plannedQuantity: dto.plannedQuantity,
    actualQuantity: dto.quantity,
    labelStatus: dto.labelStatus as TransportBoxTarget['labelStatus'],
  };
}

function mapInstructionPoint(dto: WorkInstructionPointDto): WorkInstructionPoint {
  return {
    pointNo: dto.pointNo ?? undefined,
    key: dto.key as WorkInstructionPoint['key'],
    label: dto.label,
    value: dto.value,
    scope: dto.scope as WorkInstructionPoint['scope'],
    positionNos: dto.positionNos,
  };
}

/** Rebuild the per-SKU `onlineMarks` map from each position's `skuLines[].onlineMark`. */
function collectOnlineMarks(positions: readonly ReceiptPositionDto[]): Record<string, OnlineSizeMark> {
  const marks: Record<string, OnlineSizeMark> = {};
  for (const pos of positions) {
    for (const sku of pos.skuLines) {
      if (sku.onlineMark) marks[sku.id] = sku.onlineMark;
    }
  }
  return marks;
}

export function mapCaseAggregate(caseId: string, dto: CaseAggregateDto): CaseAggregate {
  const c = dto.case;
  return {
    caseId,
    case: {
      id: c.id,
      // TODO(task-13+): inert placeholders — CaseSummaryDto has no equivalent
      // and neither screen reads these; replace if a screen ever needs them.
      source: 'prohandel_api',
      externalRef: c.id,
      weBelegNo: c.weBelegNo,
      deliveryNoteNo: undefined,
      bookingDate: c.bookingDate,
      branchNo: c.branchNo,
      primaryShopAreaNo: undefined,
      primaryShopNo: c.primaryShopNo ?? undefined,
      primaryFloor: undefined,
      inboundCartonCount: c.inboundCartonCount ?? undefined,
      storageLocation: c.storageLocationCode
        ? {
            id: c.storageLocationCode,
            type: (c.storageLocationKind ?? 'regal') as LocationType,
            code: c.storageLocationCode,
            active: true,
          }
        : undefined,
      section: (c.section ?? null) as SectionCode | null,
      goodsTypeText: (c.goodsType ?? undefined) as GoodsTypeText | undefined,
      priorityFlags: c.priorityFlags as PriorityFlag[],
      catManDate: undefined,
      loadPlanDate: undefined,
      totalQuantity: c.totalQuantity,
      status: c.status as CaseStatus,
      effortPoints: 0,
      estimatedMinutes: c.estimatedMinutes,
      assignedBundleId: undefined,
      docuWareUrl: c.docuWareUrl ?? undefined,
      attentionFlag: c.attentionFlag,
      attentionNote: c.attentionNote ?? undefined,
      completedAt: c.completedAt ?? undefined,
      forwardedTo: c.forwardedTo ?? undefined,
      missingFields: c.missingFields,
      deliveryGroupReleased: false,
      version: 0,
    },
    workInstruction: mapWorkInstruction(caseId, dto.workInstruction),
    positions: dto.positions.map((p) => mapPosition(caseId, p)),
    boxTargets: dto.boxTargets.map((b) => mapBoxTarget(caseId, b)),
    instructionPoints: dto.instructionPoints.map(mapInstructionPoint),
    onlineMarks: collectOnlineMarks(dto.positions),
    inspectionLevelLabel: dto.workInstruction?.inspectionLevelLabel ?? undefined,
    inspectionDescription: dto.workInstruction?.inspectionDescription ?? undefined,
  };
}
