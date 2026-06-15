import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './primitives.js';
import {
  actorTypeSchema,
  printJobStatusSchema,
  printJobTypeSchema,
  printPayloadFormatSchema,
} from './enums.js';

/**
 * Print service contract (§13.4 + §E.1). MVP: the backend renders a payload
 * (PDF by default) and enqueues a print job towards a Windows Print Server / CUPS
 * target. Deep driver integration (raw ZPL/EPL spooling) is Phase 2 (Anhang H).
 */

/** A configured physical/virtual printer the print service can target. */
export const printerSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** Windows print-share UNC or CUPS queue name. */
  queue: z.string(),
  driver: z.enum(['windows_print_server', 'cups']),
  supportedFormats: z.array(printPayloadFormatSchema).nonempty(),
  /** Which artefacts this printer is allowed to produce. */
  jobTypes: z.array(printJobTypeSchema).nonempty(),
  active: z.boolean(),
});
export type Printer = z.infer<typeof printerSchema>;

/**
 * A single print request. `isReprint` is set when re-issued after the first
 * successful/failed attempt; reprints require an explicit permission (§13.4 Nachdruck).
 */
export const printJobSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  /** Set for box_slip jobs; null for case-wide price-label batches. */
  boxId: idSchema.optional(),
  jobType: printJobTypeSchema,
  format: printPayloadFormatSchema,
  printerId: idSchema,
  printerName: z.string(),
  /** Storage key / inline reference of the rendered artefact. */
  payloadRef: z.string(),
  status: printJobStatusSchema,
  isReprint: z.boolean(),
  requestedByType: actorTypeSchema,
  requestedById: idSchema,
  requestedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.optional(),
  errorMessage: z.string().optional(),
});
export type PrintJob = z.infer<typeof printJobSchema>;

/** Box-slip label payload fields (§13.4 Boxzettel: Boxlabeldaten je Zielbox). */
export const boxSlipDataSchema = z.object({
  caseId: idSchema,
  boxId: idSchema,
  boxNo: z.number().int().positive(),
  weBelegNo: z.string(),
  branchNo: z.string(),
  shopAreaNo: z.string(),
  shopNo: z.string().optional(),
  floor: z.string().optional(),
  quantity: z.number().int().nonnegative(),
  sealCode: z.string().optional(),
});
export type BoxSlipData = z.infer<typeof boxSlipDataSchema>;
