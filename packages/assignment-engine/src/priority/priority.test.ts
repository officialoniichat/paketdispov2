import { describe, expect, it } from 'vitest';
import { goodsReceiptCaseSchema, type GoodsReceiptCase } from '@paket/domain-types';
import { classifyPriority, sortByPriority } from './priority-engine.js';
import type { EnrichedCase } from '../types.js';

const TODAY = '2026-06-15';

function makeCase(overrides: Partial<GoodsReceiptCase> & { id: string }): GoodsReceiptCase {
  return goodsReceiptCaseSchema.parse({
    source: 'prohandel_api',
    externalRef: `WE-${overrides.id}`,
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
  it('excludes parked and cancelled cases (rank 0)', () => {
    expect(classifyPriority(makeCase({ id: 'a', status: 'parked' }), { today: TODAY }).rank).toBe(0);
    expect(
      classifyPriority(makeCase({ id: 'b', status: 'cancelled' }), { today: TODAY }).rank,
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

  it('ignores catManDate for prioritisation — CatMan is informational only', () => {
    const reached = makeCase({ id: 'e', catManDate: '2026-06-15' });
    const future = makeCase({ id: 'f', catManDate: '2026-06-20' });
    expect(classifyPriority(reached, { today: TODAY }).class).toBe('fifo');
    expect(classifyPriority(future, { today: TODAY }).class).toBe('fifo');
  });

  it('ignores the display-only overdue flag — kein Überfälligkeits-Rang mehr (B1)', () => {
    const c = makeCase({ id: 'od', priorityFlags: ['overdue'] });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('fifo');
  });

  it('classifies sections 7/4/8 as tägliche Verladung (Tier 1)', () => {
    for (const section of [7, 4, 8] as const) {
      expect(
        classifyPriority(makeCase({ id: `s${section}`, section }), { today: TODAY }).class,
      ).toBe('daily_loading');
    }
  });

  it('classifies the daily shop areas 120/90 as Tier 1 — BEFORE NOS (B2)', () => {
    const shop120 = makeCase({ id: 'sh120', primaryShopAreaNo: '120', goodsTypeText: 'NOS' });
    const shop90 = makeCase({ id: 'sh90', primaryShopAreaNo: '90' });
    expect(classifyPriority(shop120, { today: TODAY }).class).toBe('daily_loading');
    expect(classifyPriority(shop90, { today: TODAY }).class).toBe('daily_loading');
  });

  it('honours a configured dailyShopAreas list', () => {
    const c = makeCase({ id: 'sh31', primaryShopAreaNo: '31' });
    expect(classifyPriority(c, { today: TODAY, dailyShopAreas: ['31'] }).class).toBe(
      'daily_loading',
    );
    expect(classifyPriority(c, { today: TODAY }).class).toBe('fifo');
  });

  it('classifies NOS goods types as Tier 2 (echter Prioritätstreiber, B2)', () => {
    for (const goodsTypeText of ['NOS', 'NOS-Nachorder', 'NOOS'] as const) {
      const c = makeCase({ id: `nos-${goodsTypeText}`, goodsTypeText });
      expect(classifyPriority(c, { today: TODAY }).class).toBe('nos_haengeware');
    }
  });

  it('classifies Hängeware (Lagerklasse haengebahn) as Tier 2', () => {
    const c = makeCase({
      id: 'hb',
      storageLocation: { id: 'loc-hb', type: 'haengebahn', code: 'HB-1', active: true },
    });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('nos_haengeware');
  });

  it('classifies sections 1/2/3 as Verladeplan-due on/after the loading day (no Vorlauf)', () => {
    const today = makeCase({ id: 'g', section: 1, loadPlanDate: TODAY });
    const future = makeCase({ id: 'h', section: 1, loadPlanDate: '2026-06-20' });
    expect(classifyPriority(today, { today: TODAY }).class).toBe('load_plan_due');
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
