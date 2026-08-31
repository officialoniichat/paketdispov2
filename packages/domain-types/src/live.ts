import { z } from 'zod';
import { isoDateTimeSchema } from './primitives.js';

/**
 * Typisierter Live-Kanal (SSE, Konzept beleg-zusammenarbeit §8, 31.08.2026).
 *
 * Ein Ereignis wird an MEHRERE Empfänger adressiert (`recipients` = employeeNos:
 * Inhaber + aktive Beteiligte, bei Einladungen der Eingeladene). `GET /api/me/stream`
 * filtert auf `recipients.includes(principal.employeeNo)`; der Teamlead-Stream
 * erhält alles. Der SSE-`event`-Name ist `type`, die Clients registrieren
 * `addEventListener` je Typ (behebt: `onmessage` erhält benannte Events nie).
 *
 * Live beschleunigt nur — Einladungen und Prüf-Haken sind immer persistiert und per
 * REST abrufbar.
 */
export const liveEventTypeSchema = z.enum([
  /** Statusübergang eines Belegs (bzw. Teilzustand wie Instruktion/Rückmeldung). */
  'case.status',
  /** „Position geprüft" gesetzt/zurückgenommen — `positionId` ist gefüllt. */
  'position.confirmed',
  /** Ist-Menge/Preiskorrektur einer Größenzeile erfasst — `positionId` = deren Position. */
  'sku.counted',
  /** Einladung zur Zusammenarbeit — Empfänger sind die Eingeladenen. */
  'collaboration.invited',
  /** Beteiligung geändert (angenommen/abgelehnt/Teil erledigt/entfernt/aufgelöst). */
  'collaboration.changed',
]);
export type LiveEventType = z.infer<typeof liveEventTypeSchema>;

export const liveEventSchema = z.object({
  type: liveEventTypeSchema,
  /** employeeNos der Adressaten; leer = nur der Teamlead-Stream sieht das Ereignis. */
  recipients: z.array(z.string()),
  caseId: z.string().nullable(),
  /** CaseStatus nach dem Ereignis (null, wenn kein Beleg-Status betroffen ist). */
  status: z.string().nullable(),
  /** Wer gehandelt hat (employeeNo); null bei Teamlead/System. */
  actorEmployeeNo: z.string().nullable(),
  positionId: z.string().nullable(),
  at: isoDateTimeSchema,
});
export type LiveEvent = z.infer<typeof liveEventSchema>;
