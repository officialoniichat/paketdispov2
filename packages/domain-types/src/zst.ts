import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './primitives.js';

/** Woher ein ZST-Abschluss stammt (Prisma `ZstSource`). */
export const zstSourceSchema = z.enum(['mobile_app', 'teamlead_dashboard', 'manual_import']);
export type ZstSource = z.infer<typeof zstSourceSchema>;

/** Completion / performance record exported to ZST (Anhang A ZstRecord). */
export const zstRecordSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  employeeId: idSchema,
  completedQuantity: z.number().int().nonnegative(),
  effortPoints: z.number().nonnegative(),
  startedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema,
  source: zstSourceSchema,
  exportedAt: isoDateTimeSchema.optional(),
});
export type ZstRecord = z.infer<typeof zstRecordSchema>;
