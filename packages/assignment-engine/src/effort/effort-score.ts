import type { EffortInputVector } from '@paket/domain-types';
import { DEFAULT_EFFORT_CONFIG, type EffortConfig } from '../config.js';

/** Effort estimate for one case: time for capacity packing + fairness points. */
export interface EffortResult {
  minutes: number;
  points: number;
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
 * Compute effort points/minutes from an {@link EffortInputVector} (§8.2 + Anhang B.3).
 *
 * Each additive term is in minutes ("zusätzliche Minuten"); checking and handling are
 * modelled as multipliers on the quantity-derived effort (the part of the work that
 * scales with piece count). `splitBoxCount` from the §8.2 formula is intentionally not
 * part of {@link EffortInputVector} and is applied downstream once box targets exist.
 */
export function computeEffort(
  vector: EffortInputVector,
  cfg: EffortConfig = DEFAULT_EFFORT_CONFIG,
): EffortResult {
  const factor = wgrFactor(vector.wgrCodes, cfg);
  const quantityMinutes = vector.totalQuantity * cfg.quantityBaseMinutes * factor;

  // Prüfanteil: percentage_check scales linearly between quantity_only and full check.
  const checkFactor = cfg.checkModeFactors[vector.goodsReceiptCheckMode];
  const effectiveCheckFactor =
    vector.goodsReceiptCheckMode === 'percentage_check' &&
    vector.goodsReceiptCheckPercentage !== undefined
      ? 1 + (checkFactor - 1) * (vector.goodsReceiptCheckPercentage / 100)
      : checkFactor;
  const checkMinutes = quantityMinutes * (effectiveCheckFactor - 1);

  // Füllmaterial/Handling factor applies to the quantity-derived effort.
  const handlingFactor = vector.handlingClass
    ? (cfg.handlingClassFactors[vector.handlingClass] ?? 1)
    : 1;
  const handlingMinutes = quantityMinutes * (handlingFactor - 1);

  const minutes =
    cfg.baseMinutesPerCase +
    quantityMinutes +
    (vector.priceLabelPrintRequired ? cfg.priceLabelPrintMinutes : 0) +
    vector.priceLabelAttachPositionCount * cfg.labelAttachMinutesPerPosition +
    vector.securityRequiredPositionCount * cfg.securityMinutesPerPosition +
    vector.onlineRelevantPositionCount * cfg.onlineHandlingMinutesPerPosition +
    (vector.redPriceRequired ? cfg.redPriceMinutesPerPosition : 0) +
    checkMinutes +
    handlingMinutes;

  const roundedMinutes = round2(minutes);
  return {
    minutes: roundedMinutes,
    points: round2(roundedMinutes * cfg.pointsPerMinute),
  };
}
