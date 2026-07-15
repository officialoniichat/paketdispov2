/** Central route helpers for the one-screen bundle flow (hub → Beleg). */

/** Home hub: „1 · Ware holen" pick list + „2 · Bearbeiten" Beleg list, one screen. */
export const TAGESSTART = '/';

/** The single per-Beleg PROCESS screen. */
export function caseProcessPath(caseId: string): string {
  return `/case/${caseId}`;
}
