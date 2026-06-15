import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './primitives.js';

/** Completion / performance record exported to ZST (Anhang A ZstRecord). */
export const zstRecordSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  employeeId: idSchema,
  completedQuantity: z.number().int().nonnegative(),
  effortPoints: z.number().nonnegative(),
  startedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema,
  source: z.enum(['mobile_app', 'teamlead_dashboard', 'manual_import']),
  exportedAt: isoDateTimeSchema.optional(),
});
export type ZstRecord = z.infer<typeof zstRecordSchema>;
