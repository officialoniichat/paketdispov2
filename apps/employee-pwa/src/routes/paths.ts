/** Central route helpers so screens and Next-Best-Action share one map. */
import type { CaseStep } from '../db/types.js';

export const TAGESSTART = '/';
export const PAKET = '/paket';

export type WorkStep = Exclude<CaseStep, 'done'>;

export function caseStepPath(caseId: string, step: WorkStep): string {
  return `/case/${caseId}/${step}`;
}

export function problemPath(caseId: string): string {
  return `/case/${caseId}/problem`;
}

/** Maps a workflow step to its route; 'done' returns to the bundle overview. */
export function routeForStep(caseId: string, step: CaseStep): string {
  return step === 'done' ? PAKET : caseStepPath(caseId, step);
}
