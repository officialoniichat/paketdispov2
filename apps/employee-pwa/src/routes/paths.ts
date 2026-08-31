/** Central route helpers for the one-screen bundle flow (hub → Beleg). */

/** Home hub: „1 · Ware holen" pick list + „2 · Bearbeiten" Beleg list, one screen. */
export const TAGESSTART = '/';

/**
 * Nachrichten-Verlauf (Beleg-Zusammenarbeit 31.08.2026): Einladungen
 * erhalten/gesendet + Teamlead-Nachrichten. Auf breiten Displays Splitscreen
 * (links die Übersicht, rechts der Verlauf), auf dem Handy nur der Verlauf.
 */
export const NACHRICHTEN = '/nachrichten';

/** The single per-Beleg PROCESS screen. */
export function caseProcessPath(caseId: string): string {
  return `/case/${caseId}`;
}
