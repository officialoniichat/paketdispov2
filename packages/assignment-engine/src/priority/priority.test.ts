import { describe, expect, it } from 'vitest';
import { goodsReceiptCaseSchema, type GoodsReceiptCase } from '@paket/domain-types';
import { classifyPriority, sortByPriority } from './priority-engine.js';
import type { EnrichedCase } from '../types.js';

const TODAY = '2026-06-15';

function makeCase(overrides: Partial<GoodsReceiptCase> & { id: string }): GoodsReceiptCase {
  return goodsReceiptCaseSchema.parse({
    documentSetId: 'ds-1',
    weBelegNo: `WE-${overrides.id}`,
    bookingDate: '2026-06-15',
    branchNo: '001',
    storageLocation: { id: 'loc-r1', type: 'regal', code: 'R1', active: true },
    section: null,
    priorityFlags: [],
    totalQuantity: 10,
    status: 'ready',
    effortPoints: 0,
    estimatedMinutes: 0,
    version: 0,
    ...overrides,
  });
}

function enrich(c: GoodsReceiptCase): EnrichedCase {
  return {
    case: c,
    priority: classifyPriority(c, { today: TODAY }),
    effortMinutes: 0,
    effortPoints: 0,
    fromPreviousDays: false,
  };
}

describe('classifyPriority (§8.1)', () => {
  it('excludes parked and needs_review cases (rank 0)', () => {
    expect(classifyPriority(makeCase({ id: 'a', status: 'parked' }), { today: TODAY }).rank).toBe(0);
    expect(
      classifyPriority(makeCase({ id: 'b', status: 'needs_review' }), { today: TODAY }).rank,
    ).toBe(0);
  });

  it('ranks manual Teamlead priority above the Prio flag', () => {
    const c = makeCase({ id: 'c', priorityFlags: ['manual_teamlead_priority', 'prio'] });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('manual_teamlead');
  });

  it('treats Prio as rank 2 even without a section (Prio != Abschnitt)', () => {
    const c = makeCase({ id: 'd', priorityFlags: ['prio'], section: null });
    expect(classifyPriority(c, { today: TODAY }).rank).toBe(2);
  });

  it('flags CatMan as due when catManDate is reached or passed', () => {
    const due = makeCase({ id: 'e', catManDate: '2026-06-15' });
    const future = makeCase({ id: 'f', catManDate: '2026-06-20' });
    expect(classifyPriority(due, { today: TODAY }).class).toBe('catman_due');
    expect(classifyPriority(future, { today: TODAY }).class).toBe('fifo');
  });

  it('classifies sections 7/4/8 as Jeden-Tag-Ware', () => {
    for (const section of [7, 4, 8] as const) {
      expect(
        classifyPriority(makeCase({ id: `s${section}`, section }), { today: TODAY }).class,
      ).toBe('every_day');
    }
  });

  it('classifies sections 1/2/3 as Verladeplan only when loadPlanDate is today or past', () => {
    const today = makeCase({ id: 'g', section: 1, loadPlanDate: TODAY });
    const future = makeCase({ id: 'h', section: 1, loadPlanDate: '2026-06-20' });
    expect(classifyPriority(today, { today: TODAY }).class).toBe('load_plan_today');
    expect(classifyPriority(future, { today: TODAY }).class).toBe('fifo');
  });
});

describe('sortByPriority (§8.3)', () => {
  it('orders by rank then FIFO booking date, deterministically', () => {
    const cases = [
      makeCase({ id: 'fifo-new', bookingDate: '2026-06-14' }),
      makeCase({ id: 'fifo-old', bookingDate: '2026-06-10' }),
      makeCase({ id: 'prio', priorityFlags: ['prio'] }),
      makeCase({ id: 'manual', priorityFlags: ['manual_teamlead_priority'] }),
      makeCase({ id: 'everyday', section: 7 }),
    ].map(enrich);

    const ordered = sortByPriority(cases).map((e) => e.case.id);
    expect(ordered).toEqual(['manual', 'prio', 'everyday', 'fifo-old', 'fifo-new']);
  });

  it('does not mutate the input array', () => {
    const cases = [makeCase({ id: 'z' }), makeCase({ id: 'a' })].map(enrich);
    const before = cases.map((e) => e.case.id);
    sortByPriority(cases);
    expect(cases.map((e) => e.case.id)).toEqual(before);
  });
});
