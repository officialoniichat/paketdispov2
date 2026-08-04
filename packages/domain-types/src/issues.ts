import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './primitives.js';
import {
  issueAuthorRoleSchema,
  issueMessageKindSchema,
  issueScopeSchema,
  issueStatusSchema,
  problemKindSchema,
} from './enums.js';
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
  /** Standardanweisung der TL zu dieser Problemart (Vorlage für den Instruktions-Dialog). */
  defaultInstruction: z.string().min(1).nullable(),
  /** true = Vorlage im Dialog automatisch vorausfüllen, false = nur per Knopf einfügbar. */
  autoInsert: z.boolean(),
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
});
export type WorkIssue = z.infer<typeof workIssueSchema>;

/**
 * Verlaufs-Eintrag je Einzel-Meldung (Kundenfeedback 04.08.2026): die Erst-
 * Meldung des MA ist der erste Eintrag, danach wachsen TL-Instruktionen und
 * MA-Rückmeldungen chronologisch — immer am konkreten Problem verankert.
 * Autor als Snapshot (OIDC-sub + Anzeigename).
 */
export const issueMessageSchema = z.object({
  id: idSchema,
  issueId: idSchema,
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  authorRole: issueAuthorRoleSchema,
  kind: issueMessageKindSchema,
  text: z.string().min(1),
  createdAt: isoDateTimeSchema,
});
export type IssueMessage = z.infer<typeof issueMessageSchema>;
