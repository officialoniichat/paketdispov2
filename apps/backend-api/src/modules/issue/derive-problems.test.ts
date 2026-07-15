import { describe, expect, it } from 'vitest';
import {
  deriveImplicitProblems,
  fullCompleteAllowed,
  type ReportedSkuState,
} from './derive-problems.js';

function sku(overrides: Partial<ReportedSkuState> = {}): ReportedSkuState {
  return {
    skuLineId: 'sku-1',
    positionId: 'pos-1',
    expectedQuantity: 10,
    confirmedQuantity: 10,
    vkLabelPrice: 19.99,
    ...overrides,
  };
}

describe('deriveImplicitProblems', () => {
  it('returns nothing when Ist=Soll and no price correction', () => {
    expect(deriveImplicitProblems([sku()])).toEqual([]);
  });

  it('derives an over_delivery with positive delta', () => {
    expect(deriveImplicitProblems([sku({ confirmedQuantity: 12 })])).toEqual([
      {
        kind: 'over_delivery',
        positionId: 'pos-1',
        skuLineId: 'sku-1',
        deviationQty: 2,
      },
    ]);
  });

  it('derives an under_delivery with negative delta', () => {
    const [problem] = deriveImplicitProblems([sku({ confirmedQuantity: 7 })]);
    expect(problem).toMatchObject({ kind: 'under_delivery', deviationQty: -3 });
  });

  it('derives a price_deviation when the corrected VK differs from the label price', () => {
    const [problem] = deriveImplicitProblems([sku({ correctedVkPrice: 14.99 })]);
    expect(problem).toMatchObject({
      kind: 'price_deviation',
      expectedVkPrice: 19.99,
      correctedVkPrice: 14.99,
    });
  });

  it('ignores a "correction" equal to the label price', () => {
    expect(deriveImplicitProblems([sku({ correctedVkPrice: 19.99 })])).toEqual([]);
  });

  it('can derive both a quantity and a price problem on the same SKU', () => {
    const problems = deriveImplicitProblems([
      sku({ confirmedQuantity: 12, correctedVkPrice: 14.99 }),
    ]);
    expect(problems.map((p) => p.kind)).toEqual(['over_delivery', 'price_deviation']);
  });
});

describe('fullCompleteAllowed', () => {
  it('allows full completion only without manual and implicit problems', () => {
    expect(fullCompleteAllowed([sku()], 0)).toBe(true);
    expect(fullCompleteAllowed([sku()], 1)).toBe(false);
    expect(fullCompleteAllowed([sku({ confirmedQuantity: 9 })], 0)).toBe(false);
  });
});
