import { describe, expect, it } from 'vitest';
import type { BelegListItem, BelegStatus, CaseProgress } from '../domain/types.js';
import { deriveBelegStatus, isBelegClosed, nextOpenBeleg, orderBelege } from './belegList.js';

const item = (over: Partial<BelegListItem>): BelegListItem => ({
  caseId: 'c1',
  weBelegNo: 'WE1',
  order: 0,
  storageLocationCode: 'R27',
  goodsType: 'regal',
  totalQuantity: 10,
  priceLabelPrintRequired: false,
  ...over,
});

const progress = (over: Partial<CaseProgress>): CaseProgress => ({
  caseId: 'c1',
  step: 'process',
  quantityCheckedPositionIds: [],
  confirmedQuantities: {},
  correctedVkPrices: {},
  problems: [],
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

  it('is partial (NOT Fertig) for a Teilabschluss — D7', () => {
    expect(deriveBelegStatus(progress({ step: 'done', partial: true }), 0)).toBe('partial');
  });

  it('is issue when an open problem exists and the case is not done', () => {
    expect(deriveBelegStatus(progress({}), 1)).toBe('issue');
  });

  it('is in_progress once any work has started', () => {
    expect(deriveBelegStatus(progress({ quantityCheckedPositionIds: ['p1'] }), 0)).toBe(
      'in_progress',
    );
    expect(deriveBelegStatus(progress({ confirmedQuantities: { s1: 1 } }), 0)).toBe('in_progress');
  });

  it('is open before any action', () => {
    expect(deriveBelegStatus(undefined, 0)).toBe('open');
    expect(deriveBelegStatus(progress({}), 0)).toBe('open');
  });
});

describe('isBelegClosed', () => {
  it('treats done and partial as closed for today, everything else as open work', () => {
    expect(isBelegClosed('done')).toBe(true);
    expect(isBelegClosed('partial')).toBe(true);
    expect(isBelegClosed('open')).toBe(false);
    expect(isBelegClosed('in_progress')).toBe(false);
    expect(isBelegClosed('issue')).toBe(false);
  });
});

describe('nextOpenBeleg', () => {
  it('returns the first Beleg in bundle order that is still open', () => {
    const belege = [item({ caseId: 'a', order: 0 }), item({ caseId: 'b', order: 1 })];
    const statuses = new Map<string, BelegStatus>([
      ['a', 'done'],
      ['b', 'open'],
    ]);
    expect(nextOpenBeleg(belege, statuses)?.caseId).toBe('b');
  });

  it('skips a partially completed Beleg (needs no more work today)', () => {
    const belege = [item({ caseId: 'a', order: 0 }), item({ caseId: 'b', order: 1 })];
    const statuses = new Map<string, BelegStatus>([
      ['a', 'partial'],
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
