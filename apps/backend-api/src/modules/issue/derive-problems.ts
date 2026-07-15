import type { ProblemKind } from '@paket/domain-types';

/**
 * Implizite Probleme (Kundenfeedback 14.07.2026, Punkt 7): eine Mehr-/Minder-
 * lieferung oder eine Preisabweichung ist AUTOMATISCH ein Problem — auch ohne
 * Problem-Button. Diese pure Ableitung ist die einzige Quelle dieser Regel;
 * die UIs zeigen sie nur an.
 */

/** Vom MA gemeldeter Stand einer Größenzeile (Ist + optionale Preiskorrektur). */
export interface ReportedSkuState {
  skuLineId: string;
  positionId: string;
  expectedQuantity: number;
  confirmedQuantity: number;
  vkLabelPrice: number | null;
  /** Korrigierter VK, wenn der MA einen falschen Etikettpreis vermerkt hat. */
  correctedVkPrice?: number | null;
}

/** Ein aus den SKU-Daten abgeleitetes implizites Problem. */
export interface ImplicitProblem {
  kind: Exclude<ProblemKind, 'manual'>;
  positionId: string;
  skuLineId: string;
  deviationQty?: number;
  expectedVkPrice?: number | null;
  correctedVkPrice?: number;
}

/** Leitet Mehr-/Minderlieferungen und Preisabweichungen aus den SKU-Meldungen ab. */
export function deriveImplicitProblems(skus: readonly ReportedSkuState[]): ImplicitProblem[] {
  const problems: ImplicitProblem[] = [];
  for (const sku of skus) {
    const delta = sku.confirmedQuantity - sku.expectedQuantity;
    if (delta !== 0) {
      problems.push({
        kind: delta > 0 ? 'over_delivery' : 'under_delivery',
        positionId: sku.positionId,
        skuLineId: sku.skuLineId,
        deviationQty: delta,
      });
    }
    if (sku.correctedVkPrice != null && sku.correctedVkPrice !== sku.vkLabelPrice) {
      problems.push({
        kind: 'price_deviation',
        positionId: sku.positionId,
        skuLineId: sku.skuLineId,
        expectedVkPrice: sku.vkLabelPrice,
        correctedVkPrice: sku.correctedVkPrice,
      });
    }
  }
  return problems;
}

/**
 * „Beleg erledigt" (voll) ist nur erlaubt, wenn weder implizite noch manuelle
 * Probleme vorliegen — sonst ist der Teilabschluss Pflicht (Punkt 7).
 */
export function fullCompleteAllowed(
  skus: readonly ReportedSkuState[],
  manualProblemCount: number,
): boolean {
  return manualProblemCount === 0 && deriveImplicitProblems(skus).length === 0;
}
