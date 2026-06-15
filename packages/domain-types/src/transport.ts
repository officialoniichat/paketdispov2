import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './primitives.js';
import { goodsTypeTextSchema } from './enums.js';

/** Physical transport box + box label (Anhang A TransportBox). */
export const transportBoxSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  boxNo: z.number().int().positive(),
  branchNo: z.string(),
  shopAreaNo: z.string(),
  shopNo: z.string().optional(),
  hShopNo: z.string().optional(),
  floor: z.string().optional(),
  goodsTypeText: goodsTypeTextSchema.optional(),
  positionIds: z.array(idSchema),
  quantity: z.number().int().nonnegative(),
  labelPrinted: z.boolean(),
  sealed: z.boolean(),
  completedAt: isoDateTimeSchema.optional(),
});
export type TransportBox = z.infer<typeof transportBoxSchema>;

/** Box routing target with label/seal/conveyor state (Anhang D TransportBoxTarget). */
export const transportBoxTargetSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  branchNo: z.string(),
  shopAreaNo: z.string(),
  shopNo: z.string().optional(),
  hShopNo: z.string().optional(),
  floor: z.string().optional(),
  goodsType: z.enum([
    'vororder',
    'nachorder',
    'sopo',
    'nos',
    'extrabestellung',
    'nos_nachorder',
    'prio',
    'mixed',
  ]),
  positionIds: z.array(idSchema),
  plannedQuantity: z.number().int().nonnegative(),
  actualQuantity: z.number().int().nonnegative().optional(),
  labelStatus: z.enum(['not_required', 'pending', 'printed', 'reprinted']),
  sealCode: z.string().optional(),
  conveyorConfirmedAt: isoDateTimeSchema.optional(),
});
export type TransportBoxTarget = z.infer<typeof transportBoxTargetSchema>;
