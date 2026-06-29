import type { EffortInputVector } from '@paket/domain-types';
import { DEFAULT_EFFORT_CONFIG, type EffortConfig } from '../config.js';
import { computeEffortBreakdown, type EffortComponents } from './effort-score.js';

/**
 * Aufwands-Vorschau (§8.2 / Anhang B.3).
 *
 * The teamlead cockpit edits the REAL effort parameters — the actual minutes per
 * activity (`EffortConfig` = `RuleConfig.effort`), not abstract multiplier factors.
 * This helper runs the SINGLE source-of-truth formula {@link computeEffortBreakdown}
 * over a representative example beleg so the cockpit can show, live, how the configured
 * minutes produce a beleg's processing time and Aufwandspunkte. There is no second
 * formula and no hidden defaults: every number shown is a configured parameter.
 *
 * Aufwand bestimmt Bearbeitungszeit (Minuten) und Aufwandspunkte (Last/Fairness) und
 * damit indirekt Bündelgröße und Lastverteilung — er beeinflusst NICHT den Prioritäts-
 * Rang (der ergibt sich aus Prio-Flags/Terminen in der priority-engine).
 */

/**
 * Representative "Beispiel-Beleg" for the Aufwand-preview: a mid-size mixed case that
 * touches every per-beleg driver, so changing any parameter visibly moves the estimate.
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

/** One line of the effort formula for the example beleg, in minutes. */
export interface EffortPreviewComponent {
  key: keyof EffortComponents;
  minutes: number;
}

/** Live-preview result for the Admin "Aufwand"-Tab, all via the real formula. */
export interface EffortPreviewResult {
  /** Total processing time of the example beleg under the configured parameters. */
  totalMinutes: number;
  /** Aufwandspunkte (`minutes × pointsPerMinute`). */
  totalPoints: number;
  /** The additive formula terms that sum to {@link totalMinutes}. */
  components: readonly EffortPreviewComponent[];
}

/** Order in which the formula terms are surfaced to the UI / docs. */
const COMPONENT_KEYS: readonly (keyof EffortComponents)[] = [
  'base',
  'quantity',
  'priceLabelPrint',
  'labelAttach',
  'security',
  'online',
  'redPrice',
  'check',
  'handling',
];

/**
 * Compute the example beleg's effort under the given (cockpit-edited) {@link EffortConfig}
 * using the real {@link computeEffortBreakdown}. The returned components are exactly the
 * formula's additive terms, so the cockpit can show where each minute comes from.
 */
export function previewEffort(
  config: EffortConfig = DEFAULT_EFFORT_CONFIG,
  vector: EffortInputVector = EXAMPLE_EFFORT_VECTOR,
): EffortPreviewResult {
  const result = computeEffortBreakdown(vector, config);
  return {
    totalMinutes: result.minutes,
    totalPoints: result.points,
    components: COMPONENT_KEYS.map((key) => ({ key, minutes: round2(result.components[key]) })),
  };
}
