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

/**
 * Derive the list status from progress and the case's open-issue count. A
 * Teilabschluss reads as 'partial' — NOT 'Fertig' (D7): the Beleg goes to the
 * Teamlead / re-enters the pool and must not be counted as erledigt.
 */
export function deriveBelegStatus(
  progress: CaseProgress | undefined,
  openIssues: number,
): BelegStatus {
  if (progress?.step === 'done') return progress.partial ? 'partial' : 'done';
  if (openIssues > 0) return 'issue';
  if (
    progress &&
    (progress.quantityCheckedPositionIds.length > 0 ||
      Object.keys(progress.confirmedQuantities).length > 0)
  ) {
    return 'in_progress';
  }
  return 'open';
}

/** True when the Beleg needs no more work today (fertig oder teil-abgeschlossen). */
export function isBelegClosed(status: BelegStatus): boolean {
  return status === 'done' || status === 'partial';
}

/** The next Beleg to work: first in bundle order that is still open. */
export function nextOpenBeleg(
  belege: readonly BelegListItem[],
  statuses: ReadonlyMap<string, BelegStatus>,
): BelegListItem | undefined {
  return orderBelege(belege).find((b) => !isBelegClosed(statuses.get(b.caseId) ?? 'open'));
}
