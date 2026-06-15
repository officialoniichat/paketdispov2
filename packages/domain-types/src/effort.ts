import { z } from 'zod';
import { idSchema } from './primitives.js';

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
  goodsReceiptCheckMode: z.enum(['quantity_only', 'percentage_check', 'full_check']),
  goodsReceiptCheckPercentage: z.number().min(0).max(100).optional(),
  handlingClass: z.enum(['normal', 'small_parts', 'hanging_goods', 'bulky', 'unknown']).optional(),
});
export type EffortInputVector = z.infer<typeof effortInputVectorSchema>;
