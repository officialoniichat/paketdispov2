/**
 * Pure per-case workflow model (§9.4–9.9, §E.3).
 *
 * Reducers return new CaseProgress objects (immutable update) and never touch
 * persistence or version numbers — the repository owns the optimistic-locking
 * bump. nextBestAction drives the single big primary button (Next Best Action),
 * canCompleteCase enforces the guardrails before ZST.
 */
import type { ReceiptPosition, WorkInstructionHeader } from '@paket/domain-types';
import type { BoxProgress, CaseAggregate, CaseProgress, CaseStep } from '../db/types.js';

const STEP_ORDER: readonly CaseStep[] = [
  'pickup',
  'prepare',
  'positions',
  'sort',
  'boxing',
  'complete',
  'done',
];

export function nextStep(step: CaseStep): CaseStep {
  const i = STEP_ORDER.indexOf(step);
  if (i < 0 || i >= STEP_ORDER.length - 1) return 'done';
  return STEP_ORDER[i + 1]!;
}

/** Fresh progress for a case at version 0 (persisted before the first action). */
export function initialProgress(aggregate: CaseAggregate, now: string): CaseProgress {
  const boxes: BoxProgress[] = aggregate.boxTargets.map((t, i) => ({
    boxNo: i + 1,
    positionIds: t.positionIds ?? [],
    labelPrinted: false,
    sealed: false,
    onConveyor: false,
  }));
  return {
    caseId: aggregate.caseId,
    step: 'pickup',
    pickupConfirmed: false,
    labelsPrinted: false,
    cartonOpened: false,
    prepared: false,
    confirmedPositionIds: [],
    quantityCheckedPositionIds: [],
    boxAssignmentConfirmed: false,
    boxes,
    zstDone: false,
    partial: false,
    version: 0,
    updatedAt: now,
  };
}

/** True when a scanned code matches the expected storage location (case/space-insensitive). */
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

export const allPositionsConfirmed = (p: CaseProgress, positions: ReceiptPosition[]): boolean =>
  positions.every((pos) => p.confirmedPositionIds.includes(pos.id));

export const allQuantitiesChecked = (p: CaseProgress, positions: ReceiptPosition[]): boolean =>
  positions.every((pos) => p.quantityCheckedPositionIds.includes(pos.id));

export const allBoxesSealed = (p: CaseProgress): boolean =>
  p.boxes.length > 0 && p.boxes.every((b) => b.sealed);

export interface CompletionGate {
  ok: boolean;
  reasons: string[];
}

/**
 * Hard preconditions for closing/ZST a Beleg (§9.9 + guardrails). An open
 * problem blocks the close: the Beleg must first be cleared by the Teamlead
 * (or shipped via Teilabschluss).
 */
export function canCompleteCase(
  p: CaseProgress,
  aggregate: CaseAggregate,
  openIssues: number,
): CompletionGate {
  const reasons: string[] = [];
  if (!allPositionsConfirmed(p, aggregate.positions)) {
    reasons.push('Nicht alle Positionen geprüft');
  }
  if (
    requiresQuantityCheck(aggregate.workInstruction) &&
    !allQuantitiesChecked(p, aggregate.positions)
  ) {
    reasons.push('Mindest-Stückzahlkontrolle offen');
  }
  if (aggregate.workInstruction.boxLabelRequired && !allBoxesSealed(p)) {
    reasons.push('Nicht alle Boxen verplombt');
  }
  if (openIssues > 0) {
    reasons.push('Offenes Problem – erst klären');
  }
  return { ok: reasons.length === 0, reasons };
}

// --- Immutable transitions ------------------------------------------------

export const confirmPickup = (p: CaseProgress): CaseProgress => ({
  ...p,
  pickupConfirmed: true,
  step: 'prepare',
});

export const markLabelsPrinted = (p: CaseProgress): CaseProgress => ({ ...p, labelsPrinted: true });

/** Vorbereitung step: carton opened (only after labels are printed, §G.2). */
export const openCarton = (p: CaseProgress): CaseProgress => ({ ...p, cartonOpened: true });

export const markPrepared = (p: CaseProgress): CaseProgress => ({
  ...p,
  prepared: true,
  step: 'positions',
});

export function confirmPosition(p: CaseProgress, positionId: string): CaseProgress {
  if (p.confirmedPositionIds.includes(positionId)) return p;
  return { ...p, confirmedPositionIds: [...p.confirmedPositionIds, positionId] };
}

export function checkQuantity(p: CaseProgress, positionId: string): CaseProgress {
  if (p.quantityCheckedPositionIds.includes(positionId)) return p;
  return { ...p, quantityCheckedPositionIds: [...p.quantityCheckedPositionIds, positionId] };
}

export const enterSort = (p: CaseProgress): CaseProgress => ({ ...p, step: 'sort' });
export const enterBoxing = (p: CaseProgress): CaseProgress => ({ ...p, step: 'boxing' });
export const enterComplete = (p: CaseProgress): CaseProgress => ({ ...p, step: 'complete' });

/** Box-sort step: confirm the engine's position→box mapping, advance to boxing. */
export const confirmBoxAssignment = (p: CaseProgress): CaseProgress => ({
  ...p,
  boxAssignmentConfirmed: true,
  step: 'boxing',
});

function mapBox(p: CaseProgress, boxNo: number, fn: (b: BoxProgress) => BoxProgress): CaseProgress {
  return { ...p, boxes: p.boxes.map((b) => (b.boxNo === boxNo ? fn(b) : b)) };
}

export const printBoxLabel = (p: CaseProgress, boxNo: number): CaseProgress =>
  mapBox(p, boxNo, (b) => ({ ...b, labelPrinted: true }));
export const sealBox = (p: CaseProgress, boxNo: number): CaseProgress =>
  mapBox(p, boxNo, (b) => ({ ...b, sealed: true }));
export const putBoxOnConveyor = (p: CaseProgress, boxNo: number): CaseProgress =>
  mapBox(p, boxNo, (b) => ({ ...b, onConveyor: true }));

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

// --- Next Best Action -----------------------------------------------------

export interface NextAction {
  label: string;
  step: CaseStep;
}

/** The single primary action for the current case state (§E.3 Next Best Action). */
export function nextBestAction(p: CaseProgress, aggregate: CaseAggregate): NextAction {
  switch (p.step) {
    case 'pickup':
      return { label: 'Lagerplatz scannen', step: 'pickup' };
    case 'prepare':
      if (!p.labelsPrinted) return { label: 'Etiketten drucken', step: 'prepare' };
      if (!p.cartonOpened) return { label: 'Karton geöffnet', step: 'prepare' };
      if (!p.prepared) return { label: 'Sortierung fertig', step: 'prepare' };
      return { label: 'Positionen prüfen', step: 'positions' };
    case 'positions': {
      const next = aggregate.positions.find((pos) => !p.confirmedPositionIds.includes(pos.id));
      if (next) return { label: `Position ${next.positionNo} prüfen`, step: 'positions' };
      return { label: 'Boxen sortieren', step: 'sort' };
    }
    case 'sort':
      return { label: 'Sortierung übernehmen', step: 'sort' };
    case 'boxing': {
      const nextBox = p.boxes.find((b) => !b.sealed);
      if (nextBox) return { label: `Box ${nextBox.boxNo} abschließen`, step: 'boxing' };
      return { label: 'Beleg abschließen', step: 'complete' };
    }
    case 'complete':
      return { label: 'ZST setzen und abschließen', step: 'complete' };
    case 'done':
      return { label: 'Zurück zur Liste', step: 'done' };
  }
}

/** First position not yet confirmed (drives the 9.6 single-position view). */
export function currentPosition(
  p: CaseProgress,
  positions: ReceiptPosition[],
): ReceiptPosition | undefined {
  return (
    positions.find((pos) => !p.confirmedPositionIds.includes(pos.id)) ??
    positions[positions.length - 1]
  );
}
