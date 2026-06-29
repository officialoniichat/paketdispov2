import type { EffortInputVector } from '@paket/domain-types';
import { DEFAULT_EFFORT_CONFIG, type EffortConfig } from '../config.js';

/** Effort estimate for one case: time for capacity packing + fairness points. */
export interface EffortResult {
  minutes: number;
  points: number;
}

/**
 * Named additive terms of the §8.2 effort formula, each in minutes. Every term is a
 * line of the SAME formula — exposing them lets docs and the Admin preview show
 * exactly where a beleg's minutes come from without re-implementing anything.
 */
export interface EffortComponents {
  /** Grundzeit je Beleg (fixe Rüstzeit, unabhängig von Menge). */
  base: number;
  /** Mengenerfassung: Menge × Basisminuten × WGR-Faktor. */
  quantity: number;
  /** Preisetiketten drucken (einmal je Beleg, falls erforderlich). */
  priceLabelPrint: number;
  /** Preisetiketten anbringen (je Position). */
  labelAttach: number;
  /** Warensicherung (je Position). */
  security: number;
  /** Online-Behandlung (je Position). */
  online: number;
  /** Rotpreis-Auszeichnung (einmal je Beleg, falls erforderlich). */
  redPrice: number;
  /** Prüf-Mehraufwand über der reinen Mengenerfassung (Multiplikator auf `quantity`). */
  check: number;
  /** Füllmaterial/Handling-Mehraufwand (Multiplikator auf `quantity`). */
  handling: number;
}

/** Effort estimate plus the per-term breakdown that produced it. */
export interface EffortBreakdown extends EffortResult {
  components: EffortComponents;
}

/**
 * Warengruppen-Faktor for a case. A case may span several WGR codes; the most
 * effort-intensive group drives handling, so we take the maximum factor.
 */
function wgrFactor(wgrCodes: readonly string[], cfg: EffortConfig): number {
  const fallback = cfg.wgrFactors.default ?? 1;
  if (wgrCodes.length === 0) return fallback;
  const factors = wgrCodes.map((code) => cfg.wgrFactors[code] ?? fallback);
  return Math.max(...factors);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute the effort of one {@link EffortInputVector} with its per-term breakdown
 * (§8.2 + Anhang B.3). This is the single place the formula lives.
 *
 * Each additive term is in minutes ("zusätzliche Minuten"); checking and handling are
 * modelled as multipliers on the quantity-derived effort (the part of the work that
 * scales with piece count). `splitBoxCount` from the §8.2 formula is intentionally not
 * part of {@link EffortInputVector} and is applied downstream once box targets exist.
 */
export function computeEffortBreakdown(
  vector: EffortInputVector,
  cfg: EffortConfig = DEFAULT_EFFORT_CONFIG,
): EffortBreakdown {
  const factor = wgrFactor(vector.wgrCodes, cfg);
  const quantityMinutes = vector.totalQuantity * cfg.quantityBaseMinutes * factor;

  // Prüfanteil: percentage_check scales linearly between quantity_only and full check.
  const checkFactor = cfg.checkModeFactors[vector.goodsReceiptCheckMode];
  const effectiveCheckFactor =
    vector.goodsReceiptCheckMode === 'percentage_check' &&
    vector.goodsReceiptCheckPercentage !== undefined
      ? 1 + (checkFactor - 1) * (vector.goodsReceiptCheckPercentage / 100)
      : checkFactor;

  // Füllmaterial/Handling factor applies to the quantity-derived effort.
  const handlingFactor = vector.handlingClass
    ? (cfg.handlingClassFactors[vector.handlingClass] ?? 1)
    : 1;

  const components: EffortComponents = {
    base: cfg.baseMinutesPerCase,
    quantity: quantityMinutes,
    priceLabelPrint: vector.priceLabelPrintRequired ? cfg.priceLabelPrintMinutes : 0,
    labelAttach: vector.priceLabelAttachPositionCount * cfg.labelAttachMinutesPerPosition,
    security: vector.securityRequiredPositionCount * cfg.securityMinutesPerPosition,
    online: vector.onlineRelevantPositionCount * cfg.onlineHandlingMinutesPerPosition,
    redPrice: vector.redPriceRequired ? cfg.redPriceMinutesPerPosition : 0,
    check: quantityMinutes * (effectiveCheckFactor - 1),
    handling: quantityMinutes * (handlingFactor - 1),
  };

  const total =
    components.base +
    components.quantity +
    components.priceLabelPrint +
    components.labelAttach +
    components.security +
    components.online +
    components.redPrice +
    components.check +
    components.handling;

  const minutes = round2(total);
  return { minutes, points: round2(minutes * cfg.pointsPerMinute), components };
}

/**
 * Effort points/minutes of one {@link EffortInputVector} (§8.2 + Anhang B.3).
 * Thin wrapper over {@link computeEffortBreakdown} for callers that only need totals.
 */
export function computeEffort(
  vector: EffortInputVector,
  cfg: EffortConfig = DEFAULT_EFFORT_CONFIG,
): EffortResult {
  const { minutes, points } = computeEffortBreakdown(vector, cfg);
  return { minutes, points };
}
