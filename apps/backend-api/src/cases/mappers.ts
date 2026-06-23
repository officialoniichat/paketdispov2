/**
 * Shared DTO mappers for the cases module.
 *
 * The employee case view ({@link ./cases.service}) and the teamlead case-detail
 * view ({@link ./teamlead-read.service}) both project the same persistence rows
 * onto the same response DTOs. These are the single source of those two shared
 * projections so the two services don't carry byte-identical private copies.
 */
import type {
  PositionInstructionDto,
  SkuLineDto,
  TransportBoxTargetDto,
  WorkInstructionHeaderDto,
} from './cases.dto.js';

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

/** Persistence shape of a SKU line (the fields both views expose). */
export interface SkuLineRow {
  id: string;
  ean: string;
  size: string;
  expectedQuantity: number;
  confirmedQuantity: number | null;
  status: string;
}

/** Project a SKU-line row onto its response DTO. */
export function mapSkuLine(s: SkuLineRow): SkuLineDto {
  return {
    id: s.id,
    ean: s.ean,
    size: s.size,
    expectedQuantity: s.expectedQuantity,
    confirmedQuantity: s.confirmedQuantity,
    status: s.status,
  };
}

/** Persistence shape of a per-position instruction (Anhang A PositionInstruction). */
export interface PositionInstructionRow {
  priceLabelRequired: boolean;
  priceLabelAttachRequired: boolean;
  priceLabelAttachLocation: string | null;
  securityRequired: boolean;
  securityLocation: string | null;
  onlineHandlingRequired: boolean;
  onlineHandlingLocation: string | null;
  redPriceRequired: boolean | null;
  notes: string | null;
}

/** Project a per-position instruction row onto its response DTO. */
export function mapPositionInstruction(i: PositionInstructionRow): PositionInstructionDto {
  return {
    priceLabelRequired: i.priceLabelRequired,
    priceLabelAttachRequired: i.priceLabelAttachRequired,
    priceLabelAttachLocation: i.priceLabelAttachLocation,
    securityRequired: i.securityRequired,
    securityLocation: i.securityLocation,
    onlineHandlingRequired: i.onlineHandlingRequired,
    onlineHandlingLocation: i.onlineHandlingLocation,
    redPriceRequired: i.redPriceRequired,
    notes: i.notes,
  };
}
