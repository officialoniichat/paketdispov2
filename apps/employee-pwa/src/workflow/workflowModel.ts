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
import type { CaseAggregate, CaseProgress, RecordedProblem } from '../domain/types.js';

/** Fresh progress for a Beleg at version 0 (persisted before the first action). */
export function initialProgress(aggregate: CaseAggregate, now: string): CaseProgress {
  return {
    caseId: aggregate.caseId,
    step: 'process',
    quantityCheckedPositionIds: [],
    confirmedQuantities: {},
    correctedVkPrices: {},
    problems: [],
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
  p.quantityCheckedPositionIds.length > 0 ||
  Object.keys(p.confirmedQuantities).length > 0 ||
  Object.keys(p.correctedVkPrices).length > 0 ||
  p.problems.length > 0;

/**
 * Alle Probleme des Belegs (Kundenfeedback 14.07.2026, Punkt 7): manuell erfasste
 * Positions-Probleme + IMPLIZITE Probleme (Mehr-/Minderlieferung aus
 * `confirmedQuantities`, Preisabweichung aus `correctedVkPrices`). Sobald eines
 * vorliegt, ist „Beleg erledigt" gesperrt und der Teilabschluss der Weg.
 */
export function hasAnyProblem(p: CaseProgress): boolean {
  return (
    p.problems.length > 0 ||
    Object.keys(p.confirmedQuantities).length > 0 ||
    Object.keys(p.correctedVkPrices).length > 0
  );
}

export interface CompletionGate {
  ok: boolean;
  reasons: string[];
}

/**
 * Hard preconditions for „Beleg erledigt" (voll) → ZST. Every position must be
 * geprüft, and there may be NO problem — neither manual nor implicit (Mehr-/
 * Minderlieferung, Preisabweichung). Bei einem Problem ist der Teilabschluss der
 * einzige Weg (das Backend würde „Beleg erledigt" ohnehin ablehnen).
 */
export function canCompleteCase(p: CaseProgress, aggregate: CaseAggregate): CompletionGate {
  const reasons: string[] = [];
  if (requiresQuantityCheck(aggregate.workInstruction) && !allQuantitiesChecked(p, aggregate)) {
    reasons.push('Noch nicht alle Positionen geprüft');
  }
  if (hasAnyProblem(p)) {
    reasons.push('Abweichung/Problem erfasst – nur Teilabschluss möglich');
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

/**
 * Preisabweichung (Kundenfeedback 14.07.2026, Punkt 4): korrigierter VK je Größe.
 * Ein Preis gleich dem VK-Etikett-Preis (oder ohne Etikettpreis) ist keine
 * Korrektur und wird wieder entfernt. Jede echte Korrektur ist ein implizites
 * Problem (Preisabweichung) und erzwingt den Teilabschluss.
 */
export function setCorrectedVkPrice(
  p: CaseProgress,
  skuLineId: string,
  price: number | undefined,
  vkLabelPrice: number | undefined,
): CaseProgress {
  const corrected = { ...p.correctedVkPrices };
  if (price === undefined || price < 0 || price === vkLabelPrice) {
    delete corrected[skuLineId];
  } else {
    corrected[skuLineId] = price;
  }
  return { ...p, correctedVkPrices: corrected };
}

/** Fügt ein manuell erfasstes Problem hinzu (Grund aus dem Katalog). */
export function addProblem(p: CaseProgress, problem: RecordedProblem): CaseProgress {
  return { ...p, problems: [...p.problems, problem] };
}

/** Entfernt ein manuell erfasstes Problem wieder (vor dem Teilabschluss). */
export function removeProblem(p: CaseProgress, problemId: string): CaseProgress {
  return { ...p, problems: p.problems.filter((x) => x.id !== problemId) };
}

/**
 * Total Ist-Menge across every Größe (SKU line) in the Beleg: the employee's
 * confirmed count where they touched it (D2 Mehr-/Mindermengen), otherwise the
 * Soll (expected) quantity for that Größe. This is what gets booked as the
 * ZST's `completedQuantity` — never the untouched case-level total, so a
 * recorded deviation is never silently discarded.
 */
export function totalConfirmedQuantity(p: CaseProgress, aggregate: CaseAggregate): number {
  return aggregate.positions.reduce(
    (sum, pos) =>
      sum +
      pos.skuLines.reduce(
        (posSum, sku) => posSum + (p.confirmedQuantities[sku.id] ?? sku.expectedQuantity),
        0,
      ),
    0,
  );
}

/** Eine Größenzeile im Request-Body: Ist-Menge + optional korrigierter VK. */
export interface SkuQuantityBody {
  skuLineId: string;
  confirmedQuantity: number;
  correctedVkPrice?: number;
}

/**
 * Baut die `skuQuantities` für „Beleg erledigt"/Teilabschluss: für JEDE Größe die
 * gezählte Ist-Menge (Soll wo unberührt) plus eine etwaige Preiskorrektur.
 */
export function skuQuantitiesBody(p: CaseProgress, aggregate: CaseAggregate): SkuQuantityBody[] {
  return aggregate.positions.flatMap((pos) =>
    pos.skuLines.map((sku) => {
      const corrected = p.correctedVkPrices[sku.id];
      return {
        skuLineId: sku.id,
        confirmedQuantity: p.confirmedQuantities[sku.id] ?? sku.expectedQuantity,
        ...(corrected !== undefined ? { correctedVkPrice: corrected } : {}),
      };
    }),
  );
}

/** Eine manuelle Problemmeldung im Request-Body des Teilabschlusses. */
export interface ProblemBody {
  positionId: string;
  skuLineId?: string;
  reasonId: string;
  note?: string;
}

/** Baut die manuellen `problems` für den Teilabschluss aus den lokal gesammelten. */
export function problemsBody(p: CaseProgress): ProblemBody[] {
  return p.problems.map((x) => ({
    positionId: x.positionId,
    ...(x.skuLineId ? { skuLineId: x.skuLineId } : {}),
    reasonId: x.reasonId,
    ...(x.note ? { note: x.note } : {}),
  }));
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
