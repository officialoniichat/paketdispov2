import type { EffortRuleConfig, EffortInputVector } from '@paket/domain-types';
import { DEFAULT_EFFORT_CONFIG, type EffortConfig } from '../config.js';
import { computeEffort, type EffortResult } from './effort-score.js';

/**
 * Aufwandsfaktoren — Wirkungsmodell (§8.2 / Anhang B.3, D).
 *
 * The teamlead cockpit edits six {@link EffortRuleConfig} factors (multipliers,
 * `1.0` = neutral). They never re-implement the effort formula: they only TUNE the
 * inputs of the single source of truth, {@link computeEffort}. This module projects
 * the factors onto the engine's {@link EffortConfig} and then calls the real
 * `computeEffort`, so docs, UI preview and engine all agree by construction.
 *
 * Each factor scales exactly the minute/term it governs:
 *  - `priceLabelPrintFactor` → `priceLabelPrintMinutes` + `labelAttachMinutesPerPosition`
 *    (Etikettendruck + -anbringung)
 *  - `securingFactor`        → `securityMinutesPerPosition` (Warensicherung)
 *  - `onlineFactor`          → `onlineHandlingMinutesPerPosition` (Online-Behandlung)
 *  - `redPriceFactor`        → `redPriceMinutesPerPosition` (Rotpreis)
 *  - `boxSplittingFactor`    → `boxSplitMinutesPerBox` (Karton-Splitting, greift erst
 *    downstream bei Aufteilung in mehrere Transportboxen — daher ohne Wirkung auf den
 *    Einzelbeleg-Aufwand von `computeEffort`)
 *  - `checkShareFactor`      → skaliert den Überschuss jedes Prüf-Multiplikators über 1:
 *    `checkModeFactors[m] → 1 + (base[m] − 1) × checkShareFactor`
 *
 * Wirkung: Aufwand bestimmt Bearbeitungszeit (Minuten) und Aufwandspunkte (Last/
 * Fairness) und damit indirekt Bündelgröße und Lastverteilung — er beeinflusst NICHT
 * den Prioritäts-Rang (der ergibt sich aus Prio-Flags/Terminen in der priority-engine).
 */

/** Neutral factor set (all `1.0`): applying it leaves the base config unchanged. */
export const NEUTRAL_EFFORT_FACTORS: EffortRuleConfig = {
  priceLabelPrintFactor: 1,
  securingFactor: 1,
  onlineFactor: 1,
  redPriceFactor: 1,
  checkShareFactor: 1,
  boxSplittingFactor: 1,
};

/**
 * Representative "Beispiel-Beleg" for the Aufwand-preview: a mid-size mixed case that
 * touches every per-beleg driver, so moving any factor visibly changes the estimate.
 */
export const EXAMPLE_EFFORT_VECTOR: EffortInputVector = {
  caseId: 'beispiel-beleg',
  totalQuantity: 60,
  wgrCodes: [],
  priceLabelPrintRequired: true,
  priceLabelAttachPositionCount: 12,
  securityRequiredPositionCount: 4,
  onlineRelevantPositionCount: 6,
  redPriceRequired: true,
  goodsReceiptCheckMode: 'percentage_check',
  goodsReceiptCheckPercentage: 50,
  handlingClass: 'normal',
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Project the six Aufwandsfaktoren onto the engine's {@link EffortConfig} by scaling
 * the term each factor governs. Pure — returns a new config, never mutates `base`.
 */
export function applyEffortFactors(base: EffortConfig, factors: EffortRuleConfig): EffortConfig {
  const scaleCheck = (f: number): number => 1 + (f - 1) * factors.checkShareFactor;
  return {
    ...base,
    priceLabelPrintMinutes: base.priceLabelPrintMinutes * factors.priceLabelPrintFactor,
    labelAttachMinutesPerPosition:
      base.labelAttachMinutesPerPosition * factors.priceLabelPrintFactor,
    securityMinutesPerPosition: base.securityMinutesPerPosition * factors.securingFactor,
    onlineHandlingMinutesPerPosition:
      base.onlineHandlingMinutesPerPosition * factors.onlineFactor,
    redPriceMinutesPerPosition: base.redPriceMinutesPerPosition * factors.redPriceFactor,
    boxSplitMinutesPerBox: base.boxSplitMinutesPerBox * factors.boxSplittingFactor,
    checkModeFactors: {
      quantity_only: scaleCheck(base.checkModeFactors.quantity_only),
      percentage_check: scaleCheck(base.checkModeFactors.percentage_check),
      full_check: scaleCheck(base.checkModeFactors.full_check),
    },
  };
}

/** Run the REAL {@link computeEffort} for `vector` under the given factors. */
export function previewEffortWithFactors(
  factors: EffortRuleConfig,
  vector: EffortInputVector = EXAMPLE_EFFORT_VECTOR,
  base: EffortConfig = DEFAULT_EFFORT_CONFIG,
): EffortResult {
  return computeEffort(vector, applyEffortFactors(base, factors));
}

/** Per-factor marginal effect: minutes this factor adds vs. the same beleg at `1.0`. */
export interface EffortFactorContribution {
  key: keyof EffortRuleConfig;
  /** Minutes this factor currently adds over the neutral baseline (may be 0). */
  deltaMinutes: number;
}

/** Live-preview breakdown for the Admin "Aufwand"-Tab. */
export interface EffortPreviewBreakdown {
  /** Beleg minutes with all factors neutral (`1.0`). */
  baselineMinutes: number;
  /** Beleg minutes with the factors at their configured values. */
  totalMinutes: number;
  /** Aufwandspunkte for the configured factors (`points = minutes × pointsPerMinute`). */
  totalPoints: number;
  /** Minutes added over baseline by the configured factors (`totalMinutes − baseline`). */
  factorMinutes: number;
  contributions: readonly EffortFactorContribution[];
}

const FACTOR_KEYS: readonly (keyof EffortRuleConfig)[] = [
  'priceLabelPrintFactor',
  'securingFactor',
  'onlineFactor',
  'redPriceFactor',
  'checkShareFactor',
  'boxSplittingFactor',
];

/**
 * Decompose the preview into per-factor contributions, all via the real
 * {@link computeEffort}: each contribution isolates one factor at its set value with
 * the rest neutral, so the teamlead sees exactly which driver a factor moves.
 */
export function previewEffortBreakdown(
  factors: EffortRuleConfig,
  vector: EffortInputVector = EXAMPLE_EFFORT_VECTOR,
  base: EffortConfig = DEFAULT_EFFORT_CONFIG,
): EffortPreviewBreakdown {
  const baseline = computeEffort(vector, applyEffortFactors(base, NEUTRAL_EFFORT_FACTORS));
  const full = computeEffort(vector, applyEffortFactors(base, factors));
  const contributions = FACTOR_KEYS.map((key) => {
    const isolated = computeEffort(
      vector,
      applyEffortFactors(base, { ...NEUTRAL_EFFORT_FACTORS, [key]: factors[key] }),
    );
    return { key, deltaMinutes: round2(isolated.minutes - baseline.minutes) };
  });
  return {
    baselineMinutes: baseline.minutes,
    totalMinutes: full.minutes,
    totalPoints: full.points,
    factorMinutes: round2(full.minutes - baseline.minutes),
    contributions,
  };
}
