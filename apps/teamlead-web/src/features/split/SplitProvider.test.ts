import { describe, expect, it } from 'vitest';
import { createRecordedSplit, type RecordSplitInput } from './SplitProvider.js';

const INPUT: RecordSplitInput = {
  caseId: 'case-412',
  weBelegNo: 'WE-2026-000412',
  caseEffort: { totalQuantity: 3000, effortPoints: 1382, estimatedMinutes: 1382 },
  splitMode: 'quantity',
  captureMode: 'getrennt',
  reason: 'Großmenge Koffer — auf 3 MA verteilt',
  shares: [
    { employeeId: 'emp-ak', employeeName: 'A. Köhler', quantity: 1500 },
    { employeeId: 'emp-mb', employeeName: 'M. Brandt', quantity: 1000 },
    { employeeId: 'emp-lv', employeeName: 'L. Vogt', quantity: 500 },
  ],
};

describe('createRecordedSplit', () => {
  it('apportions effort and merges employee names, summing back to the case total', () => {
    const split = createRecordedSplit(INPUT, 1, '2026-06-24T12:00:00.000Z');
    expect(split.id).toBe('split-case-412-1');
    expect(split.shares.map((s) => s.employeeName)).toEqual(['A. Köhler', 'M. Brandt', 'L. Vogt']);
    expect(split.shares.map((s) => s.effortPoints)).toEqual([691, 460.67, 230.33]);
    expect(split.isComplete).toBe(true);
  });

  it('flags a partial split (remainder left open) as not complete', () => {
    const partial = createRecordedSplit(
      { ...INPUT, shares: INPUT.shares.slice(0, 2) },
      2,
      '2026-06-24T12:00:00.000Z',
    );
    expect(partial.isComplete).toBe(false);
  });
});
