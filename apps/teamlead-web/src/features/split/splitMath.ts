/**
 * Beleg-Split fachlogik — the single source of split math for the Teamlead UI.
 *
 * The dialog and the Leistung view render from these pure functions; they never
 * compute apportionment or validation themselves. Mirrors the worked example in
 * docs/concept/beleg-split-multi-employee-concept.md §2.3.
 *
 * Engine note: the production engine will own the authoritative apportionment and
 * the `exceeds_single_shift` detection (deferred). Until then this module provides
 * the manual planning estimate. At plan time both capture modes (getrennt/anteilig)
 * show the same proportional estimate — they only diverge at capture time
 * (measured per person vs. divided total).
 */

/** Split by numeric quantity vs. by whole positions (position picker is deferred). */
export type SplitMode = 'quantity' | 'position';

/** „getrennt" = measured per person; „anteilig" = total divided by quantity share. */
export type CaptureMode = 'getrennt' | 'anteilig';

/** How a single share fits into one shift's net capacity. */
export type ShareFit = 'ok' | 'tight' | 'over';

/** One employee's intended quantity share (dialog input). */
export interface ShareDraft {
  employeeId: string;
  quantity: number;
}

/** The case's effort envelope being split. */
export interface CaseEffort {
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
}

/** A share with its apportioned effort (dialog/Leistung output). */
export interface ShareComputed extends ShareDraft {
  /** quantity / totalQuantity as a percentage (1 decimal). */
  sharePct: number;
  effortPoints: number;
  estimatedMinutes: number;
}

/** Outcome of validating a set of draft shares against the case total. */
export interface SplitValidation {
  assignedQuantity: number;
  /** total − assigned, clamped at 0 (never negative). */
  remaining: number;
  overAssigned: boolean;
  hasEmptyShare: boolean;
  isComplete: boolean;
  isValid: boolean;
}

/** A share fitting modestly past one shift up to this factor is „tight", beyond it „over". */
const TIGHT_FACTOR = 1.5;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Even quantity split across `count` people; the last share absorbs the remainder
 * so the parts always sum back to `total` exactly.
 */
export function suggestedQuantities(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const out = Array.from({ length: count }, () => base);
  const last = out.length - 1;
  out[last] = total - base * (count - 1);
  return out;
}

/**
 * How many people a case should be split across so each share fits one shift:
 * ⌈caseMinutes / ceiling⌉, never fewer than two (a split needs two).
 */
export function suggestedSplitCount(caseMinutes: number, ceilingMinutes: number): number {
  if (ceilingMinutes <= 0) return 2;
  return Math.max(2, Math.ceil(caseMinutes / ceilingMinutes));
}

/**
 * Apportion the case's effort across the draft shares strictly by quantity ratio.
 * The last share absorbs the rounding drift so effort/minutes sum to the case total.
 */
export function apportion(shares: readonly ShareDraft[], caseEffort: CaseEffort): ShareComputed[] {
  const { totalQuantity, effortPoints, estimatedMinutes } = caseEffort;
  if (shares.length === 0) return [];

  const lastIndex = shares.length - 1;
  let pointsSoFar = 0;
  let minutesSoFar = 0;

  return shares.map((share, index) => {
    const ratio = totalQuantity > 0 ? share.quantity / totalQuantity : 0;
    const isLast = index === lastIndex;

    const points = isLast ? round2(effortPoints - pointsSoFar) : round2(effortPoints * ratio);
    const minutes = isLast ? round2(estimatedMinutes - minutesSoFar) : round2(estimatedMinutes * ratio);
    pointsSoFar = round2(pointsSoFar + points);
    minutesSoFar = round2(minutesSoFar + minutes);

    return {
      employeeId: share.employeeId,
      quantity: share.quantity,
      sharePct: totalQuantity > 0 ? round1(ratio * 100) : 0,
      effortPoints: points,
      estimatedMinutes: minutes,
    };
  });
}

/**
 * Validate draft shares against the case total. A split needs at least two shares,
 * every share must be positive, and the sum must not exceed the total (a partial
 * split that leaves a remainder for later top-up is allowed).
 */
export function validateShares(shares: readonly ShareDraft[], totalQuantity: number): SplitValidation {
  const assignedQuantity = shares.reduce((sum, s) => sum + s.quantity, 0);
  const overAssigned = assignedQuantity > totalQuantity;
  const hasEmptyShare = shares.some((s) => s.quantity <= 0);
  const isComplete = assignedQuantity === totalQuantity;
  const remaining = Math.max(0, totalQuantity - assignedQuantity);
  const isValid = shares.length >= 2 && !overAssigned && !hasEmptyShare && assignedQuantity > 0;
  return { assignedQuantity, remaining, overAssigned, hasEmptyShare, isComplete, isValid };
}

/** Classify how a share's planned minutes fit one shift's net capacity. */
export function fitForShare(shareMinutes: number, ceilingMinutes: number): ShareFit {
  if (ceilingMinutes <= 0) return 'over';
  if (shareMinutes <= ceilingMinutes) return 'ok';
  if (shareMinutes <= ceilingMinutes * TIGHT_FACTOR) return 'tight';
  return 'over';
}
