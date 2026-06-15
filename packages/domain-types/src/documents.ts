import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema } from './primitives.js';
import { documentKindSchema, documentSourceSchema, parseStatusSchema } from './enums.js';

/** Stored file reference – documents/photos live in object storage, not the DB. */
export const fileRefSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  mimeType: z.string(),
  storageKey: z.string(),
  sha256: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type FileRef = z.infer<typeof fileRefSchema>;

/** One physical document within a set (delivery note / goods receipt / work instruction). */
export const documentRefSchema = z.object({
  id: idSchema,
  documentSetId: idSchema,
  kind: documentKindSchema,
  file: fileRefSchema,
  parserVersion: z.string().optional(),
  parseStatus: parseStatusSchema,
  parseWarnings: z.array(z.string()),
});
export type DocumentRef = z.infer<typeof documentRefSchema>;

/** The three-document bundle per goods-receipt process. */
export const documentSetSchema = z.object({
  id: idSchema,
  source: documentSourceSchema,
  importedAt: isoDateTimeSchema,
  bookingDate: isoDateSchema.optional(),
  weBelegNo: z.string().optional(),
  deliveryNoteNo: z.string().optional(),
  documents: z.array(documentRefSchema),
  parseConfidence: z.number().min(0).max(1),
  status: parseStatusSchema,
});
export type DocumentSet = z.infer<typeof documentSetSchema>;
