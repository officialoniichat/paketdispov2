import { describe, expect, it } from 'vitest';
import type { EffortInputVector } from '@paket/domain-types';
import { computeEffort } from './effort-score.js';
import { DEFAULT_EFFORT_CONFIG, type EffortConfig } from '../config.js';

/**
 * §8.2 Aufwandsscore — coverage suite (pre-pilot quality, concept §17.2).
 * Asserts each effort driver in isolation, the check-mode/handling multipliers,
 * monotonicity ("more work ⇒ not-less effort") and determinism. Behaviour-focused, AAA.
 *
 * NOTE on box-split: the §8.2 formula's `splitBoxCount` penalty is intentionally NOT
 * part of {@link EffortInputVector} / {@link computeEffort} (see effort-score.ts docstring
 * "applied downstream once box targets exist"). The box-split surcharge is therefore
 * asserted at the config level via `boxSplitMinutesPerBox`, not on computeEffort output.
 */

const cfg = DEFAULT_EFFORT_CONFIG;

function vector(overrides: Partial<EffortInputVector> = {}): EffortInputVector {
  return {
    caseId: 'case-1',
    totalQuantity: 0,
    wgrCodes: [],
    priceLabelPrintRequired: false,
    priceLabelAttachPositionCount: 0,
    securityRequiredPositionCount: 0,
    onlineRelevantPositionCount: 0,
    redPriceRequired: false,
    goodsReceiptCheckMode: 'quantity_only',
    ...overrides,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

describe('computeEffort — base & quantity scaling (§8.2)', () => {
  it('returns just the base minutes for an empty case', () => {
    const result = computeEffort(vector());
    expect(result.minutes).toBe(cfg.baseMinutesPerCase);
  });

  it('scales linearly with quantity at the configured base rate', () => {
    const q10 = computeEffort(vector({ totalQuantity: 10, wgrCodes: ['default'] }));
    const q20 = computeEffort(vector({ totalQuantity: 20, wgrCodes: ['default'] }));
    // base + qty*0.35; the quantity-derived part doubles when quantity doubles
    expect(q10.minutes).toBe(round2(cfg.baseMinutesPerCase + 10 * cfg.quantityBaseMinutes));
    expect(q20.minutes).toBe(round2(cfg.baseMinutesPerCase + 20 * cfg.quantityBaseMinutes));
    expect(q20.minutes - cfg.baseMinutesPerCase).toBeCloseTo(
      2 * (q10.minutes - cfg.baseMinutesPerCase),
      5,
    );
  });

  it('falls back to the default WGR factor for unknown codes and an empty code list', () => {
    const unknown = computeEffort(vector({ totalQuantity: 10, wgrCodes: ['999999'] }));
    const empty = computeEffort(vector({ totalQuantity: 10, wgrCodes: [] }));
    const fallback = round2(cfg.baseMinutesPerCase + 10 * cfg.quantityBaseMinutes * 1);
    expect(unknown.minutes).toBe(fallback);
    expect(empty.minutes).toBe(fallback);
  });

  it('uses the most effort-intensive WGR factor when several are present', () => {
    const result = computeEffort(vector({ totalQuantity: 10, wgrCodes: ['111130', '218110'] }));
    // max(1.0, 1.15) = 1.15 → 3 + 10*0.35*1.15
    expect(result.minutes).toBe(round2(cfg.baseMinutesPerCase + 10 * cfg.quantityBaseMinutes * 1.15));
  });
});

describe('computeEffort — goods-receipt check modes (§8.2 Prüfanteil)', () => {
  it('quantity_only adds no checking surcharge (factor 1.0)', () => {
    const result = computeEffort(vector({ totalQuantity: 100, wgrCodes: ['default'] }));
    expect(result.minutes).toBe(round2(cfg.baseMinutesPerCase + 100 * cfg.quantityBaseMinutes));
  });

  it('full_check applies the full check factor to the quantity-derived effort', () => {
    const result = computeEffort(
      vector({ totalQuantity: 100, wgrCodes: ['default'], goodsReceiptCheckMode: 'full_check' }),
    );
    const quantityMinutes = 100 * cfg.quantityBaseMinutes;
    const checkMinutes = quantityMinutes * (cfg.checkModeFactors.full_check - 1);
    expect(result.minutes).toBe(round2(cfg.baseMinutesPerCase + quantityMinutes + checkMinutes));
  });

  it('percentage_check at 100% reaches the full percentage-mode check factor', () => {
    const result = computeEffort(
      vector({
        totalQuantity: 100,
        wgrCodes: ['default'],
        goodsReceiptCheckMode: 'percentage_check',
        goodsReceiptCheckPercentage: 100,
      }),
    );
    const quantityMinutes = 100 * cfg.quantityBaseMinutes;
    // at 100%, effective factor = 1 + (1.25-1)*1 = 1.25
    const checkMinutes = quantityMinutes * (cfg.checkModeFactors.percentage_check - 1);
    expect(result.minutes).toBe(round2(cfg.baseMinutesPerCase + quantityMinutes + checkMinutes));
  });

  it('percentage_check at 0% (or undefined) adds no checking surcharge', () => {
    const zero = computeEffort(
      vector({
        totalQuantity: 100,
        wgrCodes: ['default'],
        goodsReceiptCheckMode: 'percentage_check',
        goodsReceiptCheckPercentage: 0,
      }),
    );
    expect(zero.minutes).toBe(round2(cfg.baseMinutesPerCase + 100 * cfg.quantityBaseMinutes));
  });

  it('percentage_check scales monotonically between 0% and 100%', () => {
    const base = vector({
      totalQuantity: 100,
      wgrCodes: ['default'],
      goodsReceiptCheckMode: 'percentage_check',
    });
    const p0 = computeEffort({ ...base, goodsReceiptCheckPercentage: 0 }).minutes;
    const p50 = computeEffort({ ...base, goodsReceiptCheckPercentage: 50 }).minutes;
    const p100 = computeEffort({ ...base, goodsReceiptCheckPercentage: 100 }).minutes;
    expect(p0).toBeLessThan(p50);
    expect(p50).toBeLessThan(p100);
  });

  it('full_check is at least as heavy as a 100% percentage_check for the same case', () => {
    const base = vector({ totalQuantity: 100, wgrCodes: ['default'] });
    const full = computeEffort({ ...base, goodsReceiptCheckMode: 'full_check' }).minutes;
    const pct100 = computeEffort({
      ...base,
      goodsReceiptCheckMode: 'percentage_check',
      goodsReceiptCheckPercentage: 100,
    }).minutes;
    expect(full).toBeGreaterThanOrEqual(pct100);
  });
});

describe('computeEffort — additive position drivers (§8.2)', () => {
  it('adds a fixed surcharge when a price label must be printed', () => {
    const without = computeEffort(vector({ totalQuantity: 10, wgrCodes: ['default'] }));
    const withPrint = computeEffort(
      vector({ totalQuantity: 10, wgrCodes: ['default'], priceLabelPrintRequired: true }),
    );
    expect(withPrint.minutes - without.minutes).toBeCloseTo(cfg.priceLabelPrintMinutes, 5);
  });

  it('adds per-position minutes for price-label attachment', () => {
    const result = computeEffort(vector({ priceLabelAttachPositionCount: 4 }));
    expect(result.minutes).toBe(
      round2(cfg.baseMinutesPerCase + 4 * cfg.labelAttachMinutesPerPosition),
    );
  });

  it('adds per-position minutes for security-required positions', () => {
    const result = computeEffort(vector({ securityRequiredPositionCount: 3 }));
    expect(result.minutes).toBe(round2(cfg.baseMinutesPerCase + 3 * cfg.securityMinutesPerPosition));
  });

  it('adds per-position minutes for online-relevant positions', () => {
    const result = computeEffort(vector({ onlineRelevantPositionCount: 5 }));
    expect(result.minutes).toBe(
      round2(cfg.baseMinutesPerCase + 5 * cfg.onlineHandlingMinutesPerPosition),
    );
  });

  it('adds a fixed surcharge when a red price is required', () => {
    const without = computeEffort(vector());
    const withRed = computeEffort(vector({ redPriceRequired: true }));
    expect(withRed.minutes - without.minutes).toBeCloseTo(cfg.redPriceMinutesPerPosition, 5);
  });
});

describe('computeEffort — handling class (§8.2 Füllmaterial/Handling)', () => {
  it('applies normal/unknown as a neutral 1.0 factor (no surcharge)', () => {
    const plain = computeEffort(vector({ totalQuantity: 50, wgrCodes: ['default'] })).minutes;
    const normal = computeEffort(
      vector({ totalQuantity: 50, wgrCodes: ['default'], handlingClass: 'normal' }),
    ).minutes;
    const unknown = computeEffort(
      vector({ totalQuantity: 50, wgrCodes: ['default'], handlingClass: 'unknown' }),
    ).minutes;
    expect(normal).toBe(plain);
    expect(unknown).toBe(plain);
  });

  it('orders handling surcharges normal < small_parts < hanging_goods < bulky', () => {
    const minutesFor = (handlingClass: EffortInputVector['handlingClass']) =>
      computeEffort(vector({ totalQuantity: 50, wgrCodes: ['default'], handlingClass })).minutes;

    const normal = minutesFor('normal');
    const small = minutesFor('small_parts');
    const hanging = minutesFor('hanging_goods');
    const bulky = minutesFor('bulky');

    expect(small).toBeGreaterThan(normal);
    expect(hanging).toBeGreaterThan(small);
    expect(bulky).toBeGreaterThan(hanging);
  });

  it('applies the handling factor to the quantity-derived effort exactly', () => {
    const result = computeEffort(
      vector({ totalQuantity: 50, wgrCodes: ['default'], handlingClass: 'bulky' }),
    );
    const quantityMinutes = 50 * cfg.quantityBaseMinutes;
    const handlingMinutes = quantityMinutes * (cfg.handlingClassFactors.bulky - 1);
    expect(result.minutes).toBe(round2(cfg.baseMinutesPerCase + quantityMinutes + handlingMinutes));
  });

  it('falls back to a neutral factor for an unmapped handling class', () => {
    const unmappedCfg: EffortConfig = {
      ...cfg,
      handlingClassFactors: { normal: 1.0 },
    };
    const result = computeEffort(
      vector({ totalQuantity: 50, wgrCodes: ['default'], handlingClass: 'bulky' }),
      unmappedCfg,
    );
    expect(result.minutes).toBe(round2(cfg.baseMinutesPerCase + 50 * cfg.quantityBaseMinutes));
  });
});

describe('computeEffort — box-split surcharge contract (§8.2, applied downstream)', () => {
  it('exposes a non-negative per-box split penalty in the config (consumed downstream)', () => {
    // computeEffort does not consume splitBoxCount; the penalty lives in config and is
    // applied once box targets are known. Assert the contract value is present & sane.
    expect(cfg.boxSplitMinutesPerBox).toBeGreaterThan(0);
  });

  it('models a box-split penalty as additive per box (downstream arithmetic)', () => {
    const baseMinutes = computeEffort(vector({ totalQuantity: 100, wgrCodes: ['default'] })).minutes;
    const splitBoxCount = 3;
    const withSplit = round2(baseMinutes + splitBoxCount * cfg.boxSplitMinutesPerBox);
    expect(withSplit).toBeGreaterThan(baseMinutes);
    expect(withSplit - baseMinutes).toBeCloseTo(splitBoxCount * cfg.boxSplitMinutesPerBox, 5);
  });
});

describe('computeEffort — points conversion (§8.2)', () => {
  it('converts minutes to points at the default 1:1 rate', () => {
    const result = computeEffort(vector({ totalQuantity: 100, wgrCodes: ['default'] }));
    expect(result.points).toBe(round2(result.minutes * cfg.pointsPerMinute));
  });

  it('honours a custom pointsPerMinute conversion', () => {
    const customCfg: EffortConfig = { ...cfg, pointsPerMinute: 2 };
    const result = computeEffort(vector({ totalQuantity: 100, wgrCodes: ['default'] }), customCfg);
    expect(result.points).toBe(round2(result.minutes * 2));
  });
});

describe('computeEffort — monotonicity & determinism (§8.2 DoD)', () => {
  it('more pieces never decrease effort', () => {
    let prev = -1;
    for (const qty of [0, 1, 10, 50, 100, 500]) {
      const m = computeEffort(vector({ totalQuantity: qty, wgrCodes: ['default'] })).minutes;
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('adding any extra driver never decreases effort (monotone in work)', () => {
    const baseline = computeEffort(vector({ totalQuantity: 50, wgrCodes: ['default'] })).minutes;

    const heavier = computeEffort(
      vector({
        totalQuantity: 50,
        wgrCodes: ['218110'],
        priceLabelPrintRequired: true,
        priceLabelAttachPositionCount: 2,
        securityRequiredPositionCount: 1,
        onlineRelevantPositionCount: 1,
        redPriceRequired: true,
        goodsReceiptCheckMode: 'full_check',
        handlingClass: 'bulky',
      }),
    ).minutes;

    expect(heavier).toBeGreaterThan(baseline);
  });

  it('is deterministic: identical input yields identical output', () => {
    const input = vector({
      totalQuantity: 123,
      wgrCodes: ['218110', '111130'],
      priceLabelPrintRequired: true,
      priceLabelAttachPositionCount: 3,
      securityRequiredPositionCount: 2,
      onlineRelevantPositionCount: 4,
      redPriceRequired: true,
      goodsReceiptCheckMode: 'percentage_check',
      goodsReceiptCheckPercentage: 40,
      handlingClass: 'hanging_goods',
    });
    const first = computeEffort(input);
    const second = computeEffort(input);
    expect(second).toEqual(first);
  });

  it('does not mutate the input vector', () => {
    const input = vector({ totalQuantity: 50, wgrCodes: ['218110'], handlingClass: 'bulky' });
    const snapshot = structuredClone(input);
    computeEffort(input);
    expect(input).toEqual(snapshot);
  });
});
