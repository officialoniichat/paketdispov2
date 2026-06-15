import { z } from 'zod';
import { idSchema, isoDateSchema, moneySchema } from './primitives.js';
import {
  caseStatusSchema,
  checkModeSchema,
  goodsTypeTextSchema,
  locationTypeSchema,
  priorityFlagSchema,
  sectionCodeSchema,
} from './enums.js';

/** Embedded storage location reference on a case (Anhang A StorageLocation). */
export const storageLocationSchema = z.object({
  id: idSchema,
  type: locationTypeSchema,
  code: z.string(),
  zone: z.string().optional(),
  sequenceIndex: z.number().int().optional(),
  barcode: z.string().optional(),
  active: z.boolean(),
});
export type StorageLocation = z.infer<typeof storageLocationSchema>;

/** Positionsbezogene Aktionen (Anhang A PositionInstruction). */
export const positionInstructionSchema = z.object({
  priceLabelRequired: z.boolean(),
  priceLabelAttachRequired: z.boolean(),
  priceLabelAttachLocation: z.string().optional(),
  securityRequired: z.boolean(),
  securityLocation: z.string().optional(),
  onlineHandlingRequired: z.boolean(),
  onlineHandlingLocation: z.string().optional(),
  redPriceRequired: z.boolean().optional(),
  notes: z.string().optional(),
});
export type PositionInstruction = z.infer<typeof positionInstructionSchema>;

/** EAN/size/quantity line (Position != SKU-line, see §6 guardrail). */
export const receiptSkuLineSchema = z.object({
  id: idSchema,
  receiptPositionId: idSchema,
  ean: z.string(),
  size: z.string(),
  expectedQuantity: z.number().int().nonnegative(),
  confirmedQuantity: z.number().int().nonnegative().optional(),
  ekPrice: moneySchema.optional(),
  vkPrice: moneySchema.optional(),
  vkLabelPrice: moneySchema.optional(),
  status: z.enum(['open', 'confirmed', 'deviation']),
});
export type ReceiptSkuLine = z.infer<typeof receiptSkuLineSchema>;

/** Position group on a case; one position spans many SKU lines. */
export const receiptPositionSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  positionNo: z.number().int(),
  wgr: z.string(),
  supplierArticleNo: z.string(),
  supplierColor: z.string(),
  season: z.string().optional(),
  nosFlag: z.boolean().optional(),
  branchNo: z.string(),
  shopNo: z.string(),
  hShopNo: z.string().optional(),
  floor: z.string().optional(),
  onlineRelevant: z.boolean().optional(),
  sustainabilityFlag: z.string().optional(),
  labelType: z.string().optional(),
  instruction: positionInstructionSchema,
  skuLines: z.array(receiptSkuLineSchema),
  status: z.enum(['open', 'confirmed', 'issue_open', 'completed']),
});
export type ReceiptPosition = z.infer<typeof receiptPositionSchema>;

/** Case-wide work instruction header. minimumQuantityCheckAlwaysRequired is true by design. */
export const workInstructionHeaderSchema = z.object({
  caseId: idSchema,
  priceLabelPrintRequired: z.boolean(),
  sortByArticleColorSizeRequired: z.boolean(),
  goodsReceiptCheckMode: checkModeSchema,
  goodsReceiptCheckPercentage: z.number().min(0).max(100).optional(),
  minimumQuantityCheckAlwaysRequired: z.literal(true),
  boxLabelRequired: z.boolean(),
  zstRequired: z.boolean(),
});
export type WorkInstructionHeader = z.infer<typeof workInstructionHeaderSchema>;

/** Digital goods-receipt processing case (Anhang A GoodsReceiptCase). */
export const goodsReceiptCaseSchema = z.object({
  id: idSchema,
  documentSetId: idSchema,
  weBelegNo: z.string(),
  deliveryNoteNo: z.string().optional(),
  bookingDate: isoDateSchema,
  weDate: isoDateSchema.optional(),
  branchNo: z.string(),
  primaryShopAreaNo: z.string().optional(),
  primaryFloor: z.string().optional(),
  storageLocation: storageLocationSchema,
  section: sectionCodeSchema.nullable(),
  goodsTypeText: goodsTypeTextSchema.optional(),
  priorityFlags: z.array(priorityFlagSchema),
  catManDate: isoDateSchema.optional(),
  loadPlanDate: isoDateSchema.optional(),
  totalQuantity: z.number().int().nonnegative(),
  status: caseStatusSchema,
  effortPoints: z.number().nonnegative(),
  estimatedMinutes: z.number().nonnegative(),
  assignedBundleId: idSchema.optional(),
  version: z.number().int().nonnegative(),
});
export type GoodsReceiptCase = z.infer<typeof goodsReceiptCaseSchema>;
