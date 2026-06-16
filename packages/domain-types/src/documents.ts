import { z } from 'zod';
import { idSchema } from './primitives.js';

/** Stored file reference – photos/attachments live in object storage, not the DB. */
export const fileRefSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  mimeType: z.string(),
  storageKey: z.string(),
  sha256: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type FileRef = z.infer<typeof fileRefSchema>;
