/**
 * Shared DTO mappers for the cases module.
 *
 * The employee case view ({@link ./cases.service}) and the teamlead case-detail
 * view ({@link ./teamlead-read.service}) both project the same persistence rows
 * onto the same response DTOs. These are the single source of those two shared
 * projections so the two services don't carry byte-identical private copies.
 */
import type { TransportBoxTargetDto, WorkInstructionHeaderDto } from './cases.dto.js';

/** Persistence shape of a work-instruction header (the fields both views expose). */
export interface WorkInstructionRow {
  priceLabelPrintRequired: boolean;
  sortByArticleColorSizeRequired: boolean;
  goodsReceiptCheckMode: string;
  goodsReceiptCheckPercentage: number | null;
  minimumQuantityCheckAlwaysRequired: boolean;
  boxLabelRequired: boolean;
  zstRequired: boolean;
}

/** Project a work-instruction header row onto its response DTO. */
export function mapWorkInstruction(wi: WorkInstructionRow): WorkInstructionHeaderDto {
  return {
    priceLabelPrintRequired: wi.priceLabelPrintRequired,
    sortByArticleColorSizeRequired: wi.sortByArticleColorSizeRequired,
    goodsReceiptCheckMode: wi.goodsReceiptCheckMode,
    goodsReceiptCheckPercentage: wi.goodsReceiptCheckPercentage,
    minimumQuantityCheckAlwaysRequired: wi.minimumQuantityCheckAlwaysRequired,
    boxLabelRequired: wi.boxLabelRequired,
    zstRequired: wi.zstRequired,
  };
}

/** Persistence shape of a transport-box target (the fields both views expose). */
export interface TransportBoxRow {
  id: string;
  boxNo: number;
  branchNo: string;
  shopAreaNo: string;
  shopNo: string | null;
  floor: string | null;
  goodsType: string | null;
  positionIds: string[];
  plannedQuantity: number;
  quantity: number;
  labelStatus: string;
  sealed: boolean;
}

/** Project a transport-box target row onto its response DTO. */
export function mapBoxTarget(b: TransportBoxRow): TransportBoxTargetDto {
  return {
    id: b.id,
    boxNo: b.boxNo,
    branchNo: b.branchNo,
    shopAreaNo: b.shopAreaNo,
    shopNo: b.shopNo,
    floor: b.floor,
    goodsType: b.goodsType,
    positionIds: b.positionIds,
    plannedQuantity: b.plannedQuantity,
    quantity: b.quantity,
    labelStatus: b.labelStatus,
    sealed: b.sealed,
  };
}
