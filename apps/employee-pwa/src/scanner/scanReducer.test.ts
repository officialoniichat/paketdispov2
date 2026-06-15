import { describe, expect, it } from 'vitest';
import { emptyScanState, feedKey, type ScanKey } from './scanReducer.js';

function feedAll(keys: ScanKey[]): string | null {
  let state = emptyScanState;
  let last: string | null = null;
  for (const key of keys) {
    const result = feedKey(state, key);
    state = result.state;
    last = result.scan;
  }
  return last;
}

describe('feedKey', () => {
  it('emits a code on a fast burst terminated by Enter', () => {
    const burst: ScanKey[] = [
      { key: 'R', time: 0 },
      { key: '2', time: 10 },
      { key: '7', time: 20 },
      { key: 'Enter', time: 30 },
    ];
    expect(feedAll(burst)).toBe('R27');
  });

  it('ignores slow human typing (gaps over the inter-key window)', () => {
    const typed: ScanKey[] = [
      { key: 'R', time: 0 },
      { key: '2', time: 500 },
      { key: '7', time: 1000 },
      { key: 'Enter', time: 1500 },
    ];
    expect(feedAll(typed)).toBeNull();
  });

  it('rejects bursts shorter than the minimum length', () => {
    const tooShort: ScanKey[] = [
      { key: 'A', time: 0 },
      { key: 'Enter', time: 5 },
    ];
    expect(feedAll(tooShort)).toBeNull();
  });
});
