/**
 * Pure per-Beleg workflow model — collapsed PROCESS phase.
 *
 * Reducers return new CaseProgress objects (immutable update) and never touch
 * persistence or version numbers — the repository owns the optimistic-locking
 * bump. The flow is intentionally flat: „Position geprüft" per position
 * (always required, even "Prüfung = Nein" — §G.1; toggleable, D5),
 * Mehr-/Mindermengen per Größe directly on the card (D2), then a clean
 * per-Beleg erledigt → ZST. Printing is upstream (vorgelagert) and Karton
 * öffnen is no work step — neither exists here (C4). Boxing is informational
 * and never gates completion.
 */
import type { WorkInstructionHeader } from '@paket/domain-types';
import type { CaseAggregate, CaseProgress } from '../db/types.js';

/** Fresh progress for a Beleg at version 0 (persisted before the first action). */
export function initialProgress(aggregate: CaseAggregate, now: string): CaseProgress {
  return {
    caseId: aggregate.caseId,
    step: 'process',
    quantityCheckedPositionIds: [],
    confirmedQuantities: {},
    zstDone: false,
    partial: false,
    version: 0,
    updatedAt: now,
  };
}

/** True when a scanned code matches the expected location (case/space-insensitive). */
export function scanMatches(scanned: string, expected: string): boolean {
  return scanned.trim().toUpperCase() === expected.trim().toUpperCase();
}

// --- Guardrails -----------------------------------------------------------

/**
 * §G.1 guardrail: a minimum quantity control is always required, even when the
 * work instruction's "Prüfung Wareneingang = Nein" mapped to quantity_only.
 * "Nein" never means none.
 */
export function requiresQuantityCheck(wi: WorkInstructionHeader): boolean {
  return wi.minimumQuantityCheckAlwaysRequired === true;
}

export const allQuantitiesChecked = (p: CaseProgress, aggregate: CaseAggregate): boolean =>
  aggregate.positions.every((pos) => p.quantityCheckedPositionIds.includes(pos.id));

/** True when the Beleg has any local work recorded (drives the in-progress status). */
export const hasProgress = (p: CaseProgress): boolean =>
  p.quantityCheckedPositionIds.length > 0 || Object.keys(p.confirmedQuantities).length > 0;

export interface CompletionGate {
  ok: boolean;
  reasons: string[];
}

/**
 * Hard preconditions for the per-Beleg erledigt → ZST. Only two gates remain:
 * every position must be geprüft, and no problem may be open (it must first be
 * cleared by the Teamlead, or shipped via Teilabschluss).
 */
export function canCompleteCase(
  p: CaseProgress,
  aggregate: CaseAggregate,
  openIssues: number,
): CompletionGate {
  const reasons: string[] = [];
  if (requiresQuantityCheck(aggregate.workInstruction) && !allQuantitiesChecked(p, aggregate)) {
    reasons.push('Noch nicht alle Positionen geprüft');
  }
  if (openIssues > 0) {
    reasons.push('Offenes Problem – erst klären');
  }
  return { ok: reasons.length === 0, reasons };
}

// --- Immutable transitions ------------------------------------------------

/** Toggle „Position geprüft" for one position (D5: un-checkable). */
export function togglePositionChecked(p: CaseProgress, positionId: string): CaseProgress {
  const checked = p.quantityCheckedPositionIds.includes(positionId)
    ? p.quantityCheckedPositionIds.filter((id) => id !== positionId)
    : [...p.quantityCheckedPositionIds, positionId];
  return { ...p, quantityCheckedPositionIds: checked };
}

/**
 * D2 Mehr-/Mindermengen: set the counted Ist-Menge for one Größe (skuLine).
 * A quantity equal to the Soll removes the deviation entry again.
 */
export function setSkuQuantity(
  p: CaseProgress,
  skuLineId: string,
  quantity: number,
  expectedQuantity: number,
): CaseProgress {
  const next = Math.max(0, quantity);
  const confirmed = { ...p.confirmedQuantities };
  if (next === expectedQuantity) {
    delete confirmed[skuLineId];
  } else {
    confirmed[skuLineId] = next;
  }
  return { ...p, confirmedQuantities: confirmed };
}

export const setZst = (p: CaseProgress): CaseProgress => ({ ...p, zstDone: true });

export const completeCase = (p: CaseProgress): CaseProgress => ({
  ...p,
  step: 'done',
  partial: false,
});

export const partialComplete = (p: CaseProgress): CaseProgress => ({
  ...p,
  step: 'done',
  partial: true,
});
