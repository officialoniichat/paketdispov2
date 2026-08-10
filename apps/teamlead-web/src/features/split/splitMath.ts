/**
 * Eingabehilfen für den Aufteilen-Dialog.
 *
 * Bewusst NUR Vorschlag und Live-Prüfung der Eingabe: wie die Ware wirklich auf die
 * Teil-Belege fällt, entscheidet das Backend entlang der Größenzeilen
 * (`apps/backend-api/src/cases/case-split.ts`) — es gibt genau eine Fachlogik, und die
 * liegt nicht hier. Die Zahlen im Dialog sind deshalb Wünsche, keine Zusagen.
 */

/** How a single share fits into one shift's net capacity. */
export type ShareFit = 'ok' | 'tight' | 'over';

/** One employee's intended quantity share (dialog input). */
export interface ShareDraft {
  employeeId: string;
  quantity: number;
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
 * Prüfe die Eingabe gegen die Belegmenge: mindestens zwei Teile, jeder Teil positiv,
 * keine Übermenge. `isComplete` meldet, ob die Teile den Beleg vollständig abdecken —
 * der Dialog verlangt das, weil ein Rest nach der Aufteilung keinen Träger mehr hätte
 * (das Original ist danach nur noch die Klammer über seinen Teilen).
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
