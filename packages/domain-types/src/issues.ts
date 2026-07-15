import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './primitives.js';
import { issueScopeSchema, issueStatusSchema, problemKindSchema } from './enums.js';
import { fileRefSchema } from './documents.js';

/**
 * Admin-verwalteter Problemarten-Katalog (Kundenfeedback 14.07.2026). Frei
 * definierbar und editierbar im Teamlead-Cockpit; die Mitarbeiter-App lädt ihn
 * dynamisch. Referenzierte Gründe werden deaktiviert statt gelöscht.
 */
export const problemReasonSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type ProblemReason = z.infer<typeof problemReasonSchema>;

/**
 * Problem an Position/SKU. Manuelle Probleme referenzieren den ProblemReason-
 * Katalog (Label-Snapshot bleibt stabil, auch wenn der Katalog später editiert
 * wird); Mehr-/Minderlieferung und Preisabweichung sind implizite Probleme,
 * die das Backend aus den gemeldeten SKU-Daten ableitet.
 */
export const workIssueSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  scope: issueScopeSchema,
  scopeId: idSchema.optional(),
  employeeId: idSchema,
  kind: problemKindSchema,
  reasonId: idSchema.optional(),
  reasonLabel: z.string().optional(),
  deviationQty: z.number().int().optional(),
  expectedVkPrice: z.number().optional(),
  correctedVkPrice: z.number().optional(),
  description: z.string().optional(),
  photoRefs: z.array(fileRefSchema).optional(),
  reportedAt: isoDateTimeSchema,
  status: issueStatusSchema,
  resolution: z.string().optional(),
  releasedBy: idSchema.optional(),
  releasedAt: isoDateTimeSchema.optional(),
});
export type WorkIssue = z.infer<typeof workIssueSchema>;
