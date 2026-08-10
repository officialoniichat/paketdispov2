import { describe, expect, it } from 'vitest';
import {
  fitForShare,
  suggestedQuantities,
  suggestedSplitCount,
  validateShares,
} from './splitMath.js';

describe('suggestedQuantities', () => {
  it('splits evenly when divisible', () => {
    expect(suggestedQuantities(3000, 3)).toEqual([1000, 1000, 1000]);
  });

  it('gives the remainder to the last share so the sum stays exact', () => {
    const q = suggestedQuantities(3001, 3);
    expect(q).toEqual([1000, 1000, 1001]);
    expect(q.reduce((a, b) => a + b, 0)).toBe(3001);
  });

  it('handles n = 2', () => {
    expect(suggestedQuantities(101, 2)).toEqual([50, 51]);
  });

  it('never returns a share below zero for tiny totals', () => {
    expect(suggestedQuantities(1, 3)).toEqual([0, 0, 1]);
  });
});

describe('suggestedSplitCount', () => {
  it('rounds the case effort up against the largest shift', () => {
    expect(suggestedSplitCount(1382, 390)).toBe(4);
  });

  it('never suggests fewer than two people (a split needs two)', () => {
    expect(suggestedSplitCount(300, 390)).toBe(2);
  });

  it('falls back to two when the ceiling is unusable', () => {
    expect(suggestedSplitCount(1382, 0)).toBe(2);
  });
});

describe('validateShares', () => {
  it('accepts a full split that sums to the total', () => {
    const v = validateShares(
      [
        { employeeId: 'a', quantity: 1500 },
        { employeeId: 'b', quantity: 1000 },
        { employeeId: 'c', quantity: 500 },
      ],
      3000,
    );
    expect(v).toMatchObject({ assignedQuantity: 3000, remaining: 0, isComplete: true, isValid: true });
  });

  it('meldet den Rest, solange die Teile den Beleg nicht abdecken', () => {
    const v = validateShares(
      [
        { employeeId: 'a', quantity: 1000 },
        { employeeId: 'b', quantity: 1000 },
      ],
      3000,
    );
    expect(v.remaining).toBe(1000);
    // Der Dialog verlangt zusätzlich isComplete — ein Rest hätte nach der Aufteilung
    // keinen Träger mehr, weil das Original nur noch die Klammer ist.
    expect(v.isComplete).toBe(false);
    expect(v.isValid).toBe(true);
  });

  it('rejects over-assignment beyond the total', () => {
    const v = validateShares(
      [
        { employeeId: 'a', quantity: 2000 },
        { employeeId: 'b', quantity: 2000 },
      ],
      3000,
    );
    expect(v.overAssigned).toBe(true);
    expect(v.isValid).toBe(false);
  });

  it('rejects an empty (zero) share', () => {
    const v = validateShares(
      [
        { employeeId: 'a', quantity: 1500 },
        { employeeId: 'b', quantity: 0 },
      ],
      3000,
    );
    expect(v.hasEmptyShare).toBe(true);
    expect(v.isValid).toBe(false);
  });

  it('rejects a one-person "split" (needs at least two)', () => {
    const v = validateShares([{ employeeId: 'a', quantity: 3000 }], 3000);
    expect(v.isValid).toBe(false);
  });
});

describe('fitForShare', () => {
  it('is ok when the share fits one shift', () => {
    expect(fitForShare(346, 390)).toBe('ok');
    expect(fitForShare(390, 390)).toBe('ok');
  });

  it('is tight when it spills modestly over a shift', () => {
    expect(fitForShare(461, 390)).toBe('tight');
  });

  it('is over when it far exceeds a shift', () => {
    expect(fitForShare(700, 390)).toBe('over');
  });
});
