/**
 * Pure selectors over the assigned Beleg list. No I/O.
 *
 * The list order is the engine bundle order (the worker processes the cart's
 * Belege); status is derived from per-case progress + open-issue count. There is
 * no free-pick priority sort — assignment and order are the engine's.
 */
import type { BelegListItem, BelegStatus, CaseProgress } from '../db/types.js';

/** Order by the bundle order (`order` index). Returns a new array. */
export function orderBelege(belege: readonly BelegListItem[]): BelegListItem[] {
  return [...belege].sort((a, b) => a.order - b.order);
}

/** Derive the list status from progress and the case's open-issue count. */
export function deriveBelegStatus(
  progress: CaseProgress | undefined,
  openIssues: number,
): BelegStatus {
  if (progress?.step === 'done') return 'done';
  if (openIssues > 0) return 'issue';
  if (
    progress &&
    (progress.labelsPrinted ||
      progress.cartonOpened ||
      progress.quantityCheckedPositionIds.length > 0)
  ) {
    return 'in_progress';
  }
  return 'open';
}

/** The next Beleg to work: first in bundle order that is not yet done. */
export function nextOpenBeleg(
  belege: readonly BelegListItem[],
  statuses: ReadonlyMap<string, BelegStatus>,
): BelegListItem | undefined {
  return orderBelege(belege).find((b) => statuses.get(b.caseId) !== 'done');
}
