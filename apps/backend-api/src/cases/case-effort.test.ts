import { describe, expect, it } from 'vitest';
import { computeEffort, DEFAULT_EFFORT_CONFIG } from '@paket/assignment-engine';
import { buildEffortVector } from '../assignment/effort-vector.js';
import { resolveCaseEffort, type ResolvableCaseRow } from './case-effort.js';

function row(overrides: Partial<ResolvableCaseRow> = {}): ResolvableCaseRow {
  return {
    id: 'case-1',
    totalQuantity: 40,
    estimatedMinutes: 999,
    effortPoints: 888,
    storageLocation: { kind: 'regal' },
    workInstruction: {
      priceLabelPrintRequired: true,
      goodsReceiptCheckMode: 'quantity_only',
      goodsReceiptCheckPercentage: null,
    },
    positions: [{ wgr: '111130', instruction: null }],
    ...overrides,
  };
}

describe('resolveCaseEffort', () => {
  it('computes live from the work instruction (ignoring the stored sentinel)', () => {
    const r = row();
    const resolved = resolveCaseEffort(r, DEFAULT_EFFORT_CONFIG);
    const expected = computeEffort(buildEffortVector(r)!, DEFAULT_EFFORT_CONFIG);
    expect(resolved.computed).toBe(true);
    expect(resolved.minutes).toBe(expected.minutes);
    expect(resolved.points).toBe(expected.points);
    expect(resolved.minutes).not.toBe(999); // not the stored fallback
    expect(resolved.components).not.toBeNull();
    expect(resolved.components!.base).toBeCloseTo(DEFAULT_EFFORT_CONFIG.baseMinutesPerCase, 2);
  });

  it('falls back to the stored estimate when the case has no work instruction', () => {
    const resolved = resolveCaseEffort(row({ workInstruction: null }), DEFAULT_EFFORT_CONFIG);
    expect(resolved.computed).toBe(false);
    expect(resolved.minutes).toBe(999);
    expect(resolved.points).toBe(888);
    expect(resolved.components).toBeNull();
  });

  it('reflects configured parameters: doubling print minutes raises the computed effort', () => {
    const r = row();
    const before = resolveCaseEffort(r, DEFAULT_EFFORT_CONFIG).minutes;
    const after = resolveCaseEffort(r, {
      ...DEFAULT_EFFORT_CONFIG,
      priceLabelPrintMinutes: 4,
    }).minutes;
    expect(after - before).toBeCloseTo(2, 2);
  });
});
