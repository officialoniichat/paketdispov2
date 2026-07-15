import { describe, expect, it } from 'vitest';
import { processingMinutes, proratedEffort } from './completion-logic.js';

describe('processingMinutes', () => {
  it('rounds the span between start and completion to whole minutes', () => {
    expect(processingMinutes('2026-07-15T08:00:00Z', '2026-07-15T08:32:30Z')).toBe(33);
  });

  it('returns 0 without a start timestamp or for negative spans', () => {
    expect(processingMinutes(undefined, '2026-07-15T08:32:30Z')).toBe(0);
    expect(processingMinutes('2026-07-15T09:00:00Z', '2026-07-15T08:00:00Z')).toBe(0);
  });
});

describe('proratedEffort', () => {
  it('prorates effort by the completed share, rounded to 2 decimals', () => {
    expect(proratedEffort(30, 10, 5)).toBe(1.67);
  });

  it('caps the ratio at 1 for Mehrmengen', () => {
    expect(proratedEffort(30, 45, 5)).toBe(5);
  });

  it('returns 0 for empty totals or nothing completed', () => {
    expect(proratedEffort(0, 10, 5)).toBe(0);
    expect(proratedEffort(30, 0, 5)).toBe(0);
  });
});
