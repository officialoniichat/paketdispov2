import { describe, expect, it } from 'vitest';
import type { BundleProgress, CollectStop } from '../domain/types.js';
import { collectCounts, isCollectComplete, toggleStop } from './collect.js';

const stop = (sequence: number, over: Partial<CollectStop> = {}): CollectStop => ({
  sequence,
  locationCode: `R${sequence}`,
  scanRequired: false,
  caseIds: [`c${sequence}`],
  ...over,
});

const progress = (over: Partial<BundleProgress> = {}): BundleProgress => ({
  collectedSequences: [],
  version: 0,
  updatedAt: '',
  ...over,
});

describe('toggleStop', () => {
  it('adds a sequence that was not collected', () => {
    const next = toggleStop(progress(), 2);
    expect(next.collectedSequences).toEqual([2]);
  });

  it('removes a sequence that was collected', () => {
    const next = toggleStop(progress({ collectedSequences: [1, 2] }), 1);
    expect(next.collectedSequences).toEqual([2]);
  });

  it('does not mutate the input', () => {
    const input = progress({ collectedSequences: [1] });
    toggleStop(input, 2);
    expect(input.collectedSequences).toEqual([1]);
  });

  it('keeps the version (repository owns the bump)', () => {
    const next = toggleStop(progress({ version: 3 }), 1);
    expect(next.version).toBe(3);
  });
});

describe('isCollectComplete', () => {
  const stops = [stop(0), stop(1), stop(2)];

  it('is false while stops remain uncollected', () => {
    expect(isCollectComplete(stops, progress({ collectedSequences: [0, 1] }))).toBe(false);
  });

  it('is true when every stop is collected', () => {
    expect(isCollectComplete(stops, progress({ collectedSequences: [0, 1, 2] }))).toBe(true);
  });

  it('is true when there are no stops (nothing to collect → never blocks)', () => {
    expect(isCollectComplete([], progress())).toBe(true);
  });

  it('is false when progress is missing and stops exist', () => {
    expect(isCollectComplete(stops, undefined)).toBe(false);
  });
});

describe('collectCounts', () => {
  it('counts collected stops out of the total', () => {
    const stops = [stop(0), stop(1), stop(2)];
    expect(collectCounts(stops, progress({ collectedSequences: [0, 2] }))).toEqual({
      total: 3,
      collected: 2,
    });
  });

  it('ignores collected sequences that are not in the current stop list', () => {
    const stops = [stop(0), stop(1)];
    expect(collectCounts(stops, progress({ collectedSequences: [0, 9] }))).toEqual({
      total: 2,
      collected: 1,
    });
  });
});
