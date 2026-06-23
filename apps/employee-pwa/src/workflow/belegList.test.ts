import { describe, expect, it } from 'vitest';
import type { BelegListItem, BelegStatus, CaseProgress } from '../db/types.js';
import { deriveBelegStatus, nextOpenBeleg, orderBelege } from './belegList.js';

const item = (over: Partial<BelegListItem>): BelegListItem => ({
  caseId: 'c1',
  weBelegNo: 'WE1',
  order: 0,
  storageLocationCode: 'R27',
  goodsType: 'regal',
  totalQuantity: 10,
  ...over,
});

const progress = (over: Partial<CaseProgress>): CaseProgress => ({
  caseId: 'c1',
  step: 'process',
  labelsPrinted: false,
  cartonOpened: false,
  quantityCheckedPositionIds: [],
  zstDone: false,
  partial: false,
  version: 0,
  updatedAt: '',
  ...over,
});

describe('orderBelege', () => {
  it('orders by bundle order ascending', () => {
    const out = orderBelege([item({ caseId: 'b', order: 1 }), item({ caseId: 'a', order: 0 })]);
    expect(out.map((b) => b.caseId)).toEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const input = [item({ caseId: 'b', order: 1 }), item({ caseId: 'a', order: 0 })];
    orderBelege(input);
    expect(input.map((b) => b.caseId)).toEqual(['b', 'a']);
  });
});

describe('deriveBelegStatus', () => {
  it('is done when the case step is done', () => {
    expect(deriveBelegStatus(progress({ step: 'done' }), 0)).toBe('done');
  });

  it('is issue when an open problem exists and the case is not done', () => {
    expect(deriveBelegStatus(progress({}), 1)).toBe('issue');
  });

  it('is in_progress once any work has started', () => {
    expect(deriveBelegStatus(progress({ labelsPrinted: true }), 0)).toBe('in_progress');
    expect(deriveBelegStatus(progress({ quantityCheckedPositionIds: ['p1'] }), 0)).toBe(
      'in_progress',
    );
  });

  it('is open before any action', () => {
    expect(deriveBelegStatus(undefined, 0)).toBe('open');
    expect(deriveBelegStatus(progress({}), 0)).toBe('open');
  });
});

describe('nextOpenBeleg', () => {
  it('returns the first Beleg in bundle order that is not done', () => {
    const belege = [item({ caseId: 'a', order: 0 }), item({ caseId: 'b', order: 1 })];
    const statuses = new Map<string, BelegStatus>([
      ['a', 'done'],
      ['b', 'open'],
    ]);
    expect(nextOpenBeleg(belege, statuses)?.caseId).toBe('b');
  });

  it('returns undefined when all are done', () => {
    const belege = [item({ caseId: 'a', order: 0 })];
    const statuses = new Map<string, BelegStatus>([['a', 'done']]);
    expect(nextOpenBeleg(belege, statuses)).toBeUndefined();
  });
});
