import { describe, expect, it } from 'vitest';
import { goodsReceiptCaseSchema, type GoodsReceiptCase } from '@paket/domain-types';
import { classifyPriority, comparePriority, sortByPriority } from './priority-engine.js';
import { PRIORITY_RANK, type EnrichedCase } from '../types.js';

/**
 * §8.1 Prioritätsklassen — coverage suite (pre-pilot quality, concept §17.2).
 * Asserts the full classification ladder, the "Prio ist kein Abschnitt" guardrail,
 * tie-break ordering and determinism of the §8.3 sort. Behaviour-focused, AAA.
 */

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
    wgrCodes: [],
    fromPreviousDays: false,
  };
}

describe('classifyPriority — exclusion (§8.1 rank 0)', () => {
  it('excludes any status that is not in the eligible set', () => {
    // Arrange: a sample of non-eligible lifecycle statuses
    const nonEligible = [
      'imported',
      'parsed',
      'needs_review',
      'parked',
      'assigned',
      'completed',
      'cancelled',
    ] as const;

    // Act + Assert
    for (const status of nonEligible) {
      const result = classifyPriority(makeCase({ id: status, status }), { today: TODAY });
      expect(result.rank).toBe(PRIORITY_RANK.exclusion);
      expect(result.class).toBe('exclusion');
    }
  });

  it('admits the default eligible statuses (ready, partially_completed)', () => {
    expect(classifyPriority(makeCase({ id: 'r', status: 'ready' }), { today: TODAY }).class).not.toBe(
      'exclusion',
    );
    expect(
      classifyPriority(makeCase({ id: 'p', status: 'partially_completed' }), { today: TODAY }).class,
    ).not.toBe('exclusion');
  });

  it('excludes even a Prio case when its status is not eligible (exclusion wins)', () => {
    const c = makeCase({
      id: 'x',
      status: 'parked',
      priorityFlags: ['prio', 'manual_teamlead_priority'],
    });
    expect(classifyPriority(c, { today: TODAY }).rank).toBe(PRIORITY_RANK.exclusion);
  });

  it('honours a custom eligibleStatuses override', () => {
    // Arrange: only 'assigned' is eligible in this context
    const ctx = { today: TODAY, eligibleStatuses: ['assigned'] as const };

    // Act + Assert: 'ready' is now excluded, 'assigned' is admitted
    expect(classifyPriority(makeCase({ id: 'a', status: 'ready' }), ctx).class).toBe('exclusion');
    expect(classifyPriority(makeCase({ id: 'b', status: 'assigned' }), ctx).class).not.toBe('exclusion');
  });
});

describe('classifyPriority — class ladder & first-match semantics (§8.1)', () => {
  it('ranks manual Teamlead priority as rank 1, above every other flag/section', () => {
    const c = makeCase({
      id: 'm',
      priorityFlags: ['manual_teamlead_priority', 'prio', 'catman_due', 'overdue'],
      section: 7,
      catManDate: TODAY,
    });
    const result = classifyPriority(c, { today: TODAY });
    expect(result.rank).toBe(PRIORITY_RANK.manualTeamlead);
    expect(result.class).toBe('manual_teamlead');
  });

  it('ranks Prio as rank 2 (above CatMan/Jeden-Tag) when no manual flag is set', () => {
    const c = makeCase({
      id: 'p',
      priorityFlags: ['prio', 'catman_due'],
      section: 4,
      catManDate: TODAY,
    });
    const result = classifyPriority(c, { today: TODAY });
    expect(result.rank).toBe(PRIORITY_RANK.prioFlag);
    expect(result.class).toBe('prio_flag');
  });

  it('guardrail: Prio is never mapped to a section — Prio in any section stays Prio', () => {
    // §8.1 "Prio ist kein Abschnitt": the prio flag classifies as its own rank,
    // not as the Jeden-Tag/Verladeplan class of its section.
    for (const section of [1, 2, 3, 4, 7, 8] as const) {
      const c = makeCase({
        id: `prio-s${section}`,
        priorityFlags: ['prio'],
        section,
        loadPlanDate: TODAY,
      });
      const result = classifyPriority(c, { today: TODAY });
      expect(result.class).toBe('prio_flag');
      expect(result.rank).toBe(PRIORITY_RANK.prioFlag);
    }
  });

  it('guardrail: a Prio case with no section at all is still rank 2 (not FIFO)', () => {
    const c = makeCase({ id: 'prio-nosec', priorityFlags: ['prio'], section: null });
    expect(classifyPriority(c, { today: TODAY }).rank).toBe(PRIORITY_RANK.prioFlag);
  });
});

describe('classifyPriority — CatMan due (§8.1 rank 3)', () => {
  it('treats an explicit catman_due flag as due regardless of dates', () => {
    const c = makeCase({ id: 'cm', priorityFlags: ['catman_due'] });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('catman_due');
  });

  it('treats an explicit overdue flag as CatMan due', () => {
    const c = makeCase({ id: 'od', priorityFlags: ['overdue'] });
    const result = classifyPriority(c, { today: TODAY });
    expect(result.class).toBe('catman_due');
    expect(result.rank).toBe(PRIORITY_RANK.catManDue);
  });

  it('treats catManDate on the planning day as due (inclusive boundary)', () => {
    const c = makeCase({ id: 'cd-today', catManDate: TODAY });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('catman_due');
  });

  it('treats a past catManDate as due', () => {
    const c = makeCase({ id: 'cd-past', catManDate: '2026-06-01' });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('catman_due');
  });

  it('does not treat a future catManDate as due (falls through to FIFO)', () => {
    const c = makeCase({ id: 'cd-future', catManDate: '2026-06-20' });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('fifo');
  });
});

describe('classifyPriority — section-based classes (§8.1 ranks 4/5)', () => {
  it('classifies sections 7/4/8 as Jeden-Tag-Ware (rank 4)', () => {
    for (const section of [7, 4, 8] as const) {
      const result = classifyPriority(makeCase({ id: `ed${section}`, section }), { today: TODAY });
      expect(result.class).toBe('every_day');
      expect(result.rank).toBe(PRIORITY_RANK.everyDay);
    }
  });

  it('classifies sections 1/2/3 with loadPlanDate <= today as Verladeplan-heute (rank 5)', () => {
    for (const section of [1, 2, 3] as const) {
      const result = classifyPriority(
        makeCase({ id: `lp${section}`, section, loadPlanDate: TODAY }),
        { today: TODAY },
      );
      expect(result.class).toBe('load_plan_today');
      expect(result.rank).toBe(PRIORITY_RANK.loadPlanToday);
    }
  });

  it('classifies sections 1/2/3 with a past loadPlanDate as Verladeplan-heute', () => {
    const c = makeCase({ id: 'lp-past', section: 2, loadPlanDate: '2026-06-10' });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('load_plan_today');
  });

  it('falls back to FIFO for sections 1/2/3 with a future loadPlanDate', () => {
    const c = makeCase({ id: 'lp-future', section: 3, loadPlanDate: '2026-06-20' });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('fifo');
  });

  it('falls back to FIFO for sections 1/2/3 with no loadPlanDate', () => {
    const c = makeCase({ id: 'lp-none', section: 1 });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('fifo');
  });

  it('Jeden-Tag sections do not require a loadPlanDate', () => {
    const c = makeCase({ id: 'ed-nolp', section: 8 });
    expect(classifyPriority(c, { today: TODAY }).class).toBe('every_day');
  });

  it('priority order: every-day section beats a verladeplan-today section', () => {
    const everyDay = classifyPriority(makeCase({ id: 'ed', section: 4 }), { today: TODAY });
    const loadPlan = classifyPriority(makeCase({ id: 'lp', section: 1, loadPlanDate: TODAY }), {
      today: TODAY,
    });
    expect(everyDay.rank).toBeLessThan(loadPlan.rank);
  });
});

describe('classifyPriority — FIFO fallback (§8.1 rank 6)', () => {
  it('falls back to FIFO for a plain eligible case with no flags/section', () => {
    const c = makeCase({ id: 'plain', section: null });
    const result = classifyPriority(c, { today: TODAY });
    expect(result.class).toBe('fifo');
    expect(result.rank).toBe(PRIORITY_RANK.fifo);
  });
});

describe('comparePriority — tie-breaks & FIFO (§8.3)', () => {
  it('orders strictly by rank when ranks differ', () => {
    const manual = enrich(makeCase({ id: 'a', priorityFlags: ['manual_teamlead_priority'] }));
    const fifo = enrich(makeCase({ id: 'b' }));
    expect(comparePriority(manual, fifo)).toBeLessThan(0);
    expect(comparePriority(fifo, manual)).toBeGreaterThan(0);
  });

  it('within the same rank, the older booking date sorts first (FIFO)', () => {
    const older = enrich(makeCase({ id: 'a', bookingDate: '2026-06-10' }));
    const newer = enrich(makeCase({ id: 'b', bookingDate: '2026-06-14' }));
    expect(comparePriority(older, newer)).toBeLessThan(0);
  });

  it('breaks a booking-date tie by weBelegNo, then by id (deterministic)', () => {
    const a = enrich(makeCase({ id: 'id-a', weBelegNo: 'WE-100' }));
    const b = enrich(makeCase({ id: 'id-b', weBelegNo: 'WE-200' }));
    // same rank + same bookingDate → weBelegNo decides
    expect(comparePriority(a, b)).toBeLessThan(0);

    const sameBeleg1 = enrich(makeCase({ id: 'id-x', weBelegNo: 'WE-SAME' }));
    const sameBeleg2 = enrich(makeCase({ id: 'id-y', weBelegNo: 'WE-SAME' }));
    // identical rank/bookingDate/weBelegNo → id decides
    expect(comparePriority(sameBeleg1, sameBeleg2)).toBeLessThan(0);
  });

  it('returns 0 for two fully-identical cases (stable equality)', () => {
    const a = enrich(makeCase({ id: 'same', weBelegNo: 'WE-SAME', bookingDate: '2026-06-10' }));
    const b = enrich(makeCase({ id: 'same', weBelegNo: 'WE-SAME', bookingDate: '2026-06-10' }));
    expect(comparePriority(a, b)).toBe(0);
  });
});

describe('sortByPriority — full ladder & determinism (§8.3)', () => {
  it('orders the complete priority ladder rank 1 → 6', () => {
    const cases = [
      makeCase({ id: 'fifo', section: null }),
      makeCase({ id: 'loadplan', section: 1, loadPlanDate: TODAY }),
      makeCase({ id: 'everyday', section: 7 }),
      makeCase({ id: 'catman', catManDate: TODAY }),
      makeCase({ id: 'prio', priorityFlags: ['prio'] }),
      makeCase({ id: 'manual', priorityFlags: ['manual_teamlead_priority'] }),
    ].map(enrich);

    const ordered = sortByPriority(cases).map((e) => e.case.id);
    expect(ordered).toEqual(['manual', 'prio', 'catman', 'everyday', 'loadplan', 'fifo']);
  });

  it('produces the same order regardless of input order (determinism)', () => {
    const build = () =>
      [
        makeCase({ id: 'c', bookingDate: '2026-06-12' }),
        makeCase({ id: 'a', bookingDate: '2026-06-12' }),
        makeCase({ id: 'b', bookingDate: '2026-06-10' }),
        makeCase({ id: 'prio', priorityFlags: ['prio'] }),
      ].map(enrich);

    const order1 = sortByPriority(build()).map((e) => e.case.id);
    const reversed = build().reverse();
    const order2 = sortByPriority(reversed).map((e) => e.case.id);
    expect(order1).toEqual(order2);
    expect(order1).toEqual(['prio', 'b', 'a', 'c']);
  });

  it('keeps excluded cases (rank 0) ahead numerically but flagged as exclusion for downstream filtering', () => {
    // Rank 0 sorts first numerically; the assignment stage filters them out by class.
    const cases = [
      makeCase({ id: 'ready', status: 'ready' }),
      makeCase({ id: 'parked', status: 'parked' }),
    ].map(enrich);

    const ordered = sortByPriority(cases);
    expect(ordered[0]?.case.id).toBe('parked');
    expect(ordered[0]?.priority.class).toBe('exclusion');
    expect(ordered[0]?.priority.rank).toBe(PRIORITY_RANK.exclusion);
  });

  it('does not mutate the input array', () => {
    const cases = [makeCase({ id: 'z' }), makeCase({ id: 'a' })].map(enrich);
    const before = cases.map((e) => e.case.id);
    sortByPriority(cases);
    expect(cases.map((e) => e.case.id)).toEqual(before);
  });
});
