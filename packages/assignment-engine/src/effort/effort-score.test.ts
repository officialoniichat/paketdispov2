import { describe, expect, it } from 'vitest';
import type { EffortInputVector } from '@paket/domain-types';
import { computeEffort } from './effort-score.js';
import { DEFAULT_EFFORT_CONFIG } from '../config.js';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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

describe('computeEffort (§8.2 / Anhang B.3)', () => {
  it('returns the base minutes for an empty case', () => {
    const result = computeEffort(vector());
    expect(result.minutes).toBe(DEFAULT_EFFORT_CONFIG.baseMinutesPerCase);
    expect(result.points).toBe(DEFAULT_EFFORT_CONFIG.baseMinutesPerCase);
  });

  it('sums all additive penalties with the WGR factor on quantity (worked example)', () => {
    // 3 + 100*0.35*1.15(=40.25) + 2 + 4*0.45(=1.8) + 2*0.75(=1.5) + 3*0.6(=1.8) + 0.5 = 50.85
    const result = computeEffort(
      vector({
        totalQuantity: 100,
        wgrCodes: ['218110'],
        priceLabelPrintRequired: true,
        priceLabelAttachPositionCount: 4,
        securityRequiredPositionCount: 2,
        onlineRelevantPositionCount: 3,
        redPriceRequired: true,
      }),
    );
    expect(result.minutes).toBe(50.85);
  });

  it('applies the full_check factor to the quantity-derived effort', () => {
    // quantityMinutes 40.25; full_check factor 1.6 adds 40.25*0.6 = 24.15 → 50.85 + 24.15 = 75.0
    const result = computeEffort(
      vector({
        totalQuantity: 100,
        wgrCodes: ['218110'],
        priceLabelPrintRequired: true,
        priceLabelAttachPositionCount: 4,
        securityRequiredPositionCount: 2,
        onlineRelevantPositionCount: 3,
        redPriceRequired: true,
        goodsReceiptCheckMode: 'full_check',
      }),
    );
    expect(result.minutes).toBe(75.0);
  });

  it('scales percentage_check linearly by the configured percentage', () => {
    const half = computeEffort(
      vector({
        totalQuantity: 100,
        wgrCodes: ['default'],
        goodsReceiptCheckMode: 'percentage_check',
        goodsReceiptCheckPercentage: 50,
      }),
    );
    // quantityMinutes = 100*0.35*1 = 35; effFactor = 1 + 0.25*0.5 = 1.125; check = 35*0.125 = 4.375
    // total = 3 + 35 + 4.375 = 42.375 → 42.38
    expect(half.minutes).toBe(42.38);
  });

  it('uses the most effort-intensive WGR factor when several are present', () => {
    const result = computeEffort(vector({ totalQuantity: 10, wgrCodes: ['111130', '218110'] }));
    // max factor 1.15 → 3 + 10*0.35*1.15 = 3 + 4.025 = 7.025 → 7.03
    expect(result.minutes).toBe(7.03);
  });

  it('adds a handling surcharge for bulky goods', () => {
    const normal = computeEffort(
      vector({ totalQuantity: 50, wgrCodes: ['default'], handlingClass: 'normal' }),
    );
    const bulky = computeEffort(
      vector({ totalQuantity: 50, wgrCodes: ['default'], handlingClass: 'bulky' }),
    );
    expect(bulky.minutes).toBeGreaterThan(normal.minutes);
  });

  it('honours a custom pointsPerMinute conversion', () => {
    const result = computeEffort(vector({ totalQuantity: 100, wgrCodes: ['default'] }), {
      ...DEFAULT_EFFORT_CONFIG,
      pointsPerMinute: 2,
    });
    expect(result.points).toBe(round2(result.minutes * 2));
  });
});
