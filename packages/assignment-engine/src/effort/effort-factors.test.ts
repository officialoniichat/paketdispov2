import { describe, expect, it } from 'vitest';
import type { EffortRuleConfig } from '@paket/domain-types';
import { DEFAULT_EFFORT_CONFIG } from '../config.js';
import { computeEffort } from './effort-score.js';
import {
  applyEffortFactors,
  previewEffortWithFactors,
  previewEffortBreakdown,
  NEUTRAL_EFFORT_FACTORS,
  EXAMPLE_EFFORT_VECTOR,
} from './effort-factors.js';

/** Mirrors DEFAULT_RULE_CONFIG.effort (Anhang B.3 admin defaults). */
const DEFAULT_FACTORS: EffortRuleConfig = {
  priceLabelPrintFactor: 1.2,
  securingFactor: 1.3,
  onlineFactor: 1.15,
  redPriceFactor: 1.1,
  checkShareFactor: 1.25,
  boxSplittingFactor: 1.4,
};

describe('applyEffortFactors', () => {
  it('is a no-op for the neutral factor set', () => {
    expect(applyEffortFactors(DEFAULT_EFFORT_CONFIG, NEUTRAL_EFFORT_FACTORS)).toEqual(
      DEFAULT_EFFORT_CONFIG,
    );
  });

  it('does not mutate the base config', () => {
    const snapshot = structuredClone(DEFAULT_EFFORT_CONFIG);
    applyEffortFactors(DEFAULT_EFFORT_CONFIG, DEFAULT_FACTORS);
    expect(DEFAULT_EFFORT_CONFIG).toEqual(snapshot);
  });

  it('scales each governed term by its factor', () => {
    const cfg = applyEffortFactors(DEFAULT_EFFORT_CONFIG, DEFAULT_FACTORS);
    expect(cfg.priceLabelPrintMinutes).toBeCloseTo(2 * 1.2, 10);
    expect(cfg.labelAttachMinutesPerPosition).toBeCloseTo(0.45 * 1.2, 10);
    expect(cfg.securityMinutesPerPosition).toBeCloseTo(0.75 * 1.3, 10);
    expect(cfg.onlineHandlingMinutesPerPosition).toBeCloseTo(0.6 * 1.15, 10);
    expect(cfg.redPriceMinutesPerPosition).toBeCloseTo(0.5 * 1.1, 10);
    expect(cfg.boxSplitMinutesPerBox).toBeCloseTo(1.25 * 1.4, 10);
    // checkShareFactor scales the *excess* over 1: 1 + (1.25 − 1) × 1.25 = 1.3125.
    expect(cfg.checkModeFactors.percentage_check).toBeCloseTo(1.3125, 10);
    // A 1.0 mode (quantity_only) stays neutral under any checkShareFactor.
    expect(cfg.checkModeFactors.quantity_only).toBeCloseTo(1, 10);
  });
});

describe('previewEffortWithFactors (uses the real computeEffort)', () => {
  it('equals computeEffort over the derived config — no re-implementation', () => {
    const expected = computeEffort(
      EXAMPLE_EFFORT_VECTOR,
      applyEffortFactors(DEFAULT_EFFORT_CONFIG, DEFAULT_FACTORS),
    );
    expect(previewEffortWithFactors(DEFAULT_FACTORS)).toEqual(expected);
  });

  it('matches the documented worked example for the Beispiel-Beleg', () => {
    // Neutral baseline = 41.13 min; default factors = 44.75 min (see concept doc).
    expect(previewEffortWithFactors(NEUTRAL_EFFORT_FACTORS).minutes).toBeCloseTo(41.13, 2);
    expect(previewEffortWithFactors(DEFAULT_FACTORS).minutes).toBeCloseTo(44.75, 2);
  });

  it('raising priceLabelPrintFactor 1.2 → 2.0 adds 5.92 min on the example beleg', () => {
    const before = previewEffortWithFactors(DEFAULT_FACTORS).minutes;
    const after = previewEffortWithFactors({
      ...DEFAULT_FACTORS,
      priceLabelPrintFactor: 2.0,
    }).minutes;
    expect(after).toBeCloseTo(50.67, 2);
    expect(after - before).toBeCloseTo(5.92, 2);
  });
});

describe('previewEffortBreakdown', () => {
  it('exposes the base (neutral) components — where the baseline minutes come from', () => {
    const b = previewEffortBreakdown(DEFAULT_FACTORS);
    const byKey = Object.fromEntries(b.baseComponents.map((c) => [c.key, c.minutes]));
    expect(byKey.base).toBeCloseTo(3, 2); // baseMinutesPerCase
    expect(byKey.quantity).toBeCloseTo(21, 2); // 60 × 0,35 × 1,0
    expect(byKey.priceLabelPrint).toBeCloseTo(2, 2);
    expect(byKey.labelAttach).toBeCloseTo(5.4, 2); // 12 × 0,45
    expect(byKey.security).toBeCloseTo(3, 2); // 4 × 0,75
    expect(byKey.online).toBeCloseTo(3.6, 2); // 6 × 0,6
    expect(byKey.redPrice).toBeCloseTo(0.5, 2);
    expect(byKey.check).toBeCloseTo(2.63, 2); // 21 × (1,125 − 1)
    expect(byKey.handling).toBe(0); // handlingClass 'normal'
    // The base components sum to the neutral baseline.
    const sum = b.baseComponents.reduce((s, c) => s + c.minutes, 0);
    expect(sum).toBeCloseTo(b.baselineMinutes, 1);
  });

  it('isolates each factor and leaves box-splitting at 0 for a single beleg', () => {
    const b = previewEffortBreakdown(DEFAULT_FACTORS);
    expect(b.baselineMinutes).toBeCloseTo(41.13, 2);
    expect(b.totalMinutes).toBeCloseTo(44.75, 2);
    expect(b.factorMinutes).toBeCloseTo(3.62, 2);

    const byKey = Object.fromEntries(b.contributions.map((c) => [c.key, c.deltaMinutes]));
    expect(byKey.priceLabelPrintFactor).toBeCloseTo(1.48, 2);
    expect(byKey.securingFactor).toBeCloseTo(0.9, 2);
    expect(byKey.onlineFactor).toBeCloseTo(0.54, 2);
    expect(byKey.redPriceFactor).toBeCloseTo(0.05, 2);
    expect(byKey.checkShareFactor).toBeCloseTo(0.65, 2);
    // Box-splitting effort is applied downstream (per transport box), not per beleg.
    expect(byKey.boxSplittingFactor).toBe(0);
  });

  it('per-factor contributions sum to factorMinutes (factors scale disjoint terms)', () => {
    const b = previewEffortBreakdown(DEFAULT_FACTORS);
    const sum = b.contributions.reduce((s, c) => s + c.deltaMinutes, 0);
    expect(sum).toBeCloseTo(b.factorMinutes, 1);
  });
});
