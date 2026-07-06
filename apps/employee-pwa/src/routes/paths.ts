/** Central route helpers for the one-screen bundle flow (hub → Beleg). */
import type { IssueScope } from '@paket/domain-types';

/** Home hub: „1 · Ware holen" pick list + „2 · Bearbeiten" Beleg list, one screen. */
export const TAGESSTART = '/';

/** The single per-Beleg PROCESS screen. */
export function caseProcessPath(caseId: string): string {
  return `/case/${caseId}`;
}

/** A pre-selected problem-report target carried to the problem screen via query. */
export interface ProblemTarget {
  scope: IssueScope;
  scopeId?: string;
}

/**
 * Problem reporting for a Beleg. Without a target it opens case-level; with a
 * concrete target (e.g. a position) it pre-selects scope + scopeId via query so
 * the worker reports exactly what is affected.
 */
export function problemPath(caseId: string, target?: ProblemTarget): string {
  const base = `/case/${caseId}/problem`;
  if (!target || target.scope === 'case') return base;
  const params = new URLSearchParams({ scope: target.scope });
  if (target.scopeId) params.set('scopeId', target.scopeId);
  return `${base}?${params.toString()}`;
}
