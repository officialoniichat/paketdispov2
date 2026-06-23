/**
 * Pure per-Beleg workflow model — collapsed PROCESS phase.
 *
 * Reducers return new CaseProgress objects (immutable update) and never touch
 * persistence or version numbers — the repository owns the optimistic-locking
 * bump. The flow is intentionally flat (client: "Der Rest ist unnötig"): the
 * only gates kept are the print-before-unpack guardrail (§G.2), the minimum
 * quantity check (always, even "Prüfung = Nein", §G.1) and a clean per-Beleg
 * erledigt → ZST. Boxing is informational and never gates completion.
 */
import type { WorkInstructionHeader } from '@paket/domain-types';
import type { CaseAggregate, CaseProgress } from '../db/types.js';

/** Fresh progress for a Beleg at version 0 (persisted before the first action). */
export function initialProgress(aggregate: CaseAggregate, now: string): CaseProgress {
  return {
    caseId: aggregate.caseId,
    step: 'process',
    labelsPrinted: false,
    cartonOpened: false,
    quantityCheckedPositionIds: [],
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

/** §G.2: the carton may only be opened once the price labels are printed. */
export function canOpenCarton(p: CaseProgress, wi: WorkInstructionHeader): boolean {
  return wi.priceLabelPrintRequired ? p.labelsPrinted : true;
}

export const allQuantitiesChecked = (p: CaseProgress, aggregate: CaseAggregate): boolean =>
  aggregate.positions.every((pos) => p.quantityCheckedPositionIds.includes(pos.id));

export interface CompletionGate {
  ok: boolean;
  reasons: string[];
}

/**
 * Hard preconditions for the per-Beleg erledigt → ZST. Only three gates remain:
 * the price labels must be printed (when required), every position's minimum
 * quantity must be checked, and no problem may be open (it must first be cleared
 * by the Teamlead, or shipped via Teilabschluss).
 */
export function canCompleteCase(
  p: CaseProgress,
  aggregate: CaseAggregate,
  openIssues: number,
): CompletionGate {
  const reasons: string[] = [];
  if (aggregate.workInstruction.priceLabelPrintRequired && !p.labelsPrinted) {
    reasons.push('Preisetiketten noch nicht gedruckt');
  }
  if (requiresQuantityCheck(aggregate.workInstruction) && !allQuantitiesChecked(p, aggregate)) {
    reasons.push('Mindest-Stückzahlkontrolle offen');
  }
  if (openIssues > 0) {
    reasons.push('Offenes Problem – erst klären');
  }
  return { ok: reasons.length === 0, reasons };
}

// --- Immutable transitions ------------------------------------------------

/** Beleg-level price label print — the §G.2 step that must precede opening the carton. */
export const markLabelsPrinted = (p: CaseProgress): CaseProgress => ({ ...p, labelsPrinted: true });

/** Carton opened (callers gate this on {@link canOpenCarton}). */
export const openCarton = (p: CaseProgress): CaseProgress => ({ ...p, cartonOpened: true });

/** Confirm the minimum quantity for one position (idempotent). */
export function checkQuantity(p: CaseProgress, positionId: string): CaseProgress {
  if (p.quantityCheckedPositionIds.includes(positionId)) return p;
  return { ...p, quantityCheckedPositionIds: [...p.quantityCheckedPositionIds, positionId] };
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
