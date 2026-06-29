import { describe, expect, it } from 'vitest';
import { DEFAULT_EFFORT_CONFIG } from '../config.js';
import { computeEffortBreakdown } from './effort-score.js';
import { previewEffort, EXAMPLE_EFFORT_VECTOR } from './effort-factors.js';

describe('previewEffort (uses the real computeEffortBreakdown)', () => {
  it('equals computeEffortBreakdown over the given config — no re-implementation', () => {
    const expected = computeEffortBreakdown(EXAMPLE_EFFORT_VECTOR, DEFAULT_EFFORT_CONFIG);
    const preview = previewEffort(DEFAULT_EFFORT_CONFIG);
    expect(preview.totalMinutes).toBe(expected.minutes);
    expect(preview.totalPoints).toBe(expected.points);
  });

  it('breaks the example beleg into its formula terms (where the minutes come from)', () => {
    const byKey = Object.fromEntries(
      previewEffort(DEFAULT_EFFORT_CONFIG).components.map((c) => [c.key, c.minutes]),
    );
    expect(byKey.base).toBeCloseTo(3, 2); // baseMinutesPerCase
    expect(byKey.quantity).toBeCloseTo(21, 2); // 60 × 0,35 × 1,0
    expect(byKey.priceLabelPrint).toBeCloseTo(2, 2); // priceLabelPrintMinutes
    expect(byKey.labelAttach).toBeCloseTo(5.4, 2); // 12 × 0,45
    expect(byKey.security).toBeCloseTo(3, 2); // 4 × 0,75
    expect(byKey.online).toBeCloseTo(3.6, 2); // 6 × 0,6
    expect(byKey.redPrice).toBeCloseTo(0.5, 2); // redPriceMinutesPerPosition
    expect(byKey.check).toBeCloseTo(2.63, 2); // 21 × (1,125 − 1)
    expect(byKey.handling).toBe(0); // handlingClass 'normal' → factor 1,0
  });

  it('the default example beleg totals 41,13 min', () => {
    const p = previewEffort(DEFAULT_EFFORT_CONFIG);
    expect(p.totalMinutes).toBeCloseTo(41.13, 2);
    expect(p.totalPoints).toBeCloseTo(41.13, 2);
    const sum = p.components.reduce((s, c) => s + c.minutes, 0);
    expect(sum).toBeCloseTo(p.totalMinutes, 1);
  });

  it('editing a base minute parameter changes the total (parameters are the real knobs)', () => {
    const before = previewEffort(DEFAULT_EFFORT_CONFIG).totalMinutes;
    // Doubling the print minutes (2 → 4) adds exactly 2 min on this beleg.
    const printDoubled = previewEffort({ ...DEFAULT_EFFORT_CONFIG, priceLabelPrintMinutes: 4 });
    expect(printDoubled.totalMinutes).toBeCloseTo(before + 2, 2);
    // Doubling label-attach minutes (0,45 → 0,90) adds 12 × 0,45 = 5,4 min.
    const attachDoubled = previewEffort({
      ...DEFAULT_EFFORT_CONFIG,
      labelAttachMinutesPerPosition: 0.9,
    });
    expect(attachDoubled.totalMinutes).toBeCloseTo(before + 5.4, 2);
  });
});
