import { z } from 'zod';
import { idSchema } from './primitives.js';

/** Goods-receipt check mode (matches Prisma `CheckMode`). */
export const goodsReceiptCheckModeSchema = z.enum([
  'quantity_only',
  'percentage_check',
  'full_check',
]);
export type GoodsReceiptCheckMode = z.infer<typeof goodsReceiptCheckModeSchema>;

/** Füllmaterial/Handling class (drives the §8.2 handling multiplier). */
export const handlingClassSchema = z.enum([
  'normal',
  'small_parts',
  'hanging_goods',
  'bulky',
  'unknown',
]);
export type HandlingClass = z.infer<typeof handlingClassSchema>;

/** Input vector for effort-point calculation (Anhang D EffortInputVector). */
export const effortInputVectorSchema = z.object({
  caseId: idSchema,
  totalQuantity: z.number().int().nonnegative(),
  wgrCodes: z.array(z.string()),
  priceLabelPrintRequired: z.boolean(),
  priceLabelAttachPositionCount: z.number().int().nonnegative(),
  securityRequiredPositionCount: z.number().int().nonnegative(),
  onlineRelevantPositionCount: z.number().int().nonnegative(),
  redPriceRequired: z.boolean(),
  goodsReceiptCheckMode: goodsReceiptCheckModeSchema,
  goodsReceiptCheckPercentage: z.number().min(0).max(100).optional(),
  handlingClass: handlingClassSchema.optional(),
});
export type EffortInputVector = z.infer<typeof effortInputVectorSchema>;
