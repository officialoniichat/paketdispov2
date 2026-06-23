/** Central route helpers for the two-phase bundle flow (hub → collect / Beleg). */

/** Home hub: bundle overview + COLLECT summary + PROCESS Beleg list. */
export const TAGESSTART = '/';

/** Consolidated COLLECT pick list for the whole bundle. */
export const COLLECT = '/collect';

/** The single per-Beleg PROCESS screen. */
export function caseProcessPath(caseId: string): string {
  return `/case/${caseId}`;
}

/** Problem reporting for a Beleg (scope: position/sku/box/case). */
export function problemPath(caseId: string): string {
  return `/case/${caseId}/problem`;
}
