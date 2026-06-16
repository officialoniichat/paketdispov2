import { describe, expect, it } from 'vitest';
import type { BelegListItem, CaseProgress } from '../db/types.js';
import { deriveBelegStatus, nextRecommended, sortBelege } from './belegList.js';

const item = (over: Partial<BelegListItem>): BelegListItem => ({
  caseId: 'c1',
  weBelegNo: 'WE1',
  prioRank: 10,
  section: null,
  storageLocationCode: 'REG-01',
  goodsType: 'regal',
  totalQuantity: 10,
  urgent: false,
  ...over,
});

const progress = (over: Partial<CaseProgress>): CaseProgress => ({
  caseId: 'c1',
  step: 'pickup',
  pickupConfirmed: false,
  labelsPrinted: false,
  cartonOpened: false,
  prepared: false,
  confirmedPositionIds: [],
  quantityCheckedPositionIds: [],
  boxAssignmentConfirmed: false,
  boxes: [],
  zstDone: false,
  partial: false,
  version: 0,
  updatedAt: '',
  ...over,
});

describe('sortBelege', () => {
  it('orders by prioRank ascending (lower = higher prio)', () => {
    const out = sortBelege([item({ caseId: 'b', prioRank: 5 }), item({ caseId: 'a', prioRank: 1 })]);
    expect(out.map((b) => b.caseId)).toEqual(['a', 'b']);
  });
  it('does not mutate the input array', () => {
    const input = [item({ caseId: 'b', prioRank: 5 }), item({ caseId: 'a', prioRank: 1 })];
    sortBelege(input);
    expect(input.map((b) => b.caseId)).toEqual(['b', 'a']);
  });
});

describe('deriveBelegStatus', () => {
  it('is done when progress step is done', () => {
    expect(deriveBelegStatus(progress({ step: 'done' }), 0)).toBe('done');
  });
  it('is issue when open issues exist and not done', () => {
    expect(deriveBelegStatus(progress({ step: 'positions' }), 1)).toBe('issue');
  });
  it('is in_progress once pickup confirmed', () => {
    expect(deriveBelegStatus(progress({ step: 'prepare', pickupConfirmed: true }), 0)).toBe(
      'in_progress',
    );
  });
  it('is open before any action', () => {
    expect(deriveBelegStatus(undefined, 0)).toBe('open');
  });
});

describe('nextRecommended', () => {
  it('returns the highest-prio Beleg that is not done', () => {
    const belege = [item({ caseId: 'a', prioRank: 1 }), item({ caseId: 'b', prioRank: 2 })];
    const statuses = new Map([
      ['a', 'done' as const],
      ['b', 'open' as const],
    ]);
    expect(nextRecommended(belege, statuses)?.caseId).toBe('b');
  });
  it('returns undefined when all done', () => {
    const belege = [item({ caseId: 'a', prioRank: 1 })];
    const statuses = new Map([['a', 'done' as const]]);
    expect(nextRecommended(belege, statuses)).toBeUndefined();
  });
});
