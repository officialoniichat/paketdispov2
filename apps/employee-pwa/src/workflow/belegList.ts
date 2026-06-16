/**
 * Pure selectors over the assigned Beleg list. No I/O. The list is sorted by
 * priority for display only; the worker may still pick any Beleg (free
 * selection). Status is derived from per-case progress + open-issue count.
 */
import type { BelegListItem, BelegStatus, CaseProgress } from '../db/types.js';

/** Sort by priority (lower prioRank first), then weBelegNo. Returns a new array. */
export function sortBelege(belege: readonly BelegListItem[]): BelegListItem[] {
  return [...belege].sort(
    (a, b) => a.prioRank - b.prioRank || a.weBelegNo.localeCompare(b.weBelegNo),
  );
}

/** Derive the list status from progress and the case's open-issue count. */
export function deriveBelegStatus(
  progress: CaseProgress | undefined,
  openIssues: number,
): BelegStatus {
  if (progress?.step === 'done') return 'done';
  if (openIssues > 0) return 'issue';
  if (progress && progress.pickupConfirmed) return 'in_progress';
  return 'open';
}

/** The recommended next Beleg: highest priority that is not yet done. */
export function nextRecommended(
  belege: readonly BelegListItem[],
  statuses: ReadonlyMap<string, BelegStatus>,
): BelegListItem | undefined {
  return sortBelege(belege).find((b) => statuses.get(b.caseId) !== 'done');
}
