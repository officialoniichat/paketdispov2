import { describe, expect, it } from 'vitest';
import {
  goodsReceiptCaseSchema,
  DEFAULT_EFFORT_RULE_CONFIG,
  type GoodsReceiptCase,
  type LoadPlanRow,
} from '@paket/domain-types';
import {
  applyResolvedLoadPlanDates,
  engineConfigFromRuleConfig,
  resolveLoadPlanDate,
} from './load-plan.js';

/**
 * Verladetag-Auflösung aus der Live-Kalenderquelle (`RuleConfig.loadPlan`),
 * Teamlead-Punkt 4. The pure resolver must anchor the loading day to the case's
 * booking date so a missed weekly day stays in the past (overdue), and pick the
 * earliest matching weekday across a shop's loading days. (2026-06-15 is a Monday.)
 */

function makeCase(overrides: Partial<GoodsReceiptCase> & { id: string }): GoodsReceiptCase {
  return goodsReceiptCaseSchema.parse({
    source: 'prohandel_api',
    externalRef: `WE-${overrides.id}`,
    weBelegNo: `WE-${overrides.id}`,
    bookingDate: '2026-06-15',
    branchNo: '001',
    primaryShopAreaNo: '21',
    primaryFloor: 'EG',
    storageLocation: { id: 'loc-r1', type: 'regal', code: 'R1', active: true },
    section: 1,
    priorityFlags: [],
    totalQuantity: 10,
    status: 'ready',
    effortPoints: 0,
    estimatedMinutes: 0,
    version: 0,
    ...overrides,
  });
}

function row(overrides: Partial<LoadPlanRow> & { weekday: string }): LoadPlanRow {
  return {
    id: `lp-${overrides.weekday}`,
    shopAreaNo: '21',
    floor: 'EG',
    validFrom: '2026-01-01',
    specialDay: false,
    ...overrides,
  };
}

describe('resolveLoadPlanDate', () => {
  it('resolves the next weekly loading weekday on/after the booking date', () => {
    // Booked Monday 2026-06-15; the shop loads on Wednesday ('Mi') → 2026-06-17.
    const c = makeCase({ id: 'weekly', bookingDate: '2026-06-15' });
    expect(resolveLoadPlanDate(c, [row({ weekday: 'Mi' })], '2026-06-15')).toBe('2026-06-17');
  });

  it('keeps a loading day booked exactly on its weekday (anchored to booking, not +1 week)', () => {
    // Booked Monday 2026-06-15; shop loads Monday ('Mo') → the loading day is that Monday.
    // Evaluated later (today 06-18) it is in the past → the engine reads it as overdue.
    const c = makeCase({ id: 'on-day', bookingDate: '2026-06-15' });
    expect(resolveLoadPlanDate(c, [row({ weekday: 'Mo' })], '2026-06-18')).toBe('2026-06-15');
  });

  it('picks the EARLIEST loading day when a shop loads on several weekdays', () => {
    const c = makeCase({ id: 'multi', bookingDate: '2026-06-15' }); // Monday
    const rows = [row({ weekday: 'Fr' }), row({ weekday: 'Mi' })];
    // Mi (06-17) is earlier than Fr (06-19).
    expect(resolveLoadPlanDate(c, rows, '2026-06-15')).toBe('2026-06-17');
  });

  it('ignores rows outside their validity window and non-matching shop/floor', () => {
    const c = makeCase({ id: 'val', bookingDate: '2026-06-15' });
    const expired = row({ weekday: 'Mi', validTo: '2026-05-01' });
    const otherShop = row({ weekday: 'Di', shopAreaNo: '99' });
    const otherFloor = row({ weekday: 'Do', floor: 'OG' });
    expect(resolveLoadPlanDate(c, [expired, otherShop, otherFloor], '2026-06-15')).toBeUndefined();
  });

  it('returns undefined when the case has no shop area / floor to match', () => {
    const c = makeCase({ id: 'noshop', primaryShopAreaNo: undefined, primaryFloor: undefined });
    expect(resolveLoadPlanDate(c, [row({ weekday: 'Mi' })], '2026-06-15')).toBeUndefined();
  });
});

describe('applyResolvedLoadPlanDates', () => {
  it('sets loadPlanDate from the calendar without mutating the input case', () => {
    const c = makeCase({ id: 'imm' });
    const [resolved] = applyResolvedLoadPlanDates([c], [row({ weekday: 'Mi' })], '2026-06-15');
    expect(resolved?.loadPlanDate).toBe('2026-06-17');
    expect(c.loadPlanDate).toBeUndefined(); // original untouched
  });

  it('keeps a pre-existing loadPlanDate when no calendar rule matches', () => {
    const c = makeCase({ id: 'keep', primaryShopAreaNo: '99', loadPlanDate: '2026-06-30' });
    const [resolved] = applyResolvedLoadPlanDates([c], [row({ weekday: 'Mi' })], '2026-06-15');
    expect(resolved?.loadPlanDate).toBe('2026-06-30');
  });
});

describe('engineConfigFromRuleConfig', () => {
  it('threads the priority Vorlauf + overrides into the engine config', () => {
    const config = engineConfigFromRuleConfig({
      priority: {
        overdueLeadDays: 3,
        overdueLeadDaysOverrides: [{ shopAreaNo: '21', leadDays: 5 }],
        fifoEnabled: true,
        manualPriorityWins: true,
      },
      reserve: { nextShiftCapacityPct: 20, minMinutesPerEmployee: 30 },
      bundle: { minMinutes: 20, maxMinutes: 90, maxCases: 8, maxHeavyCases: 2 },
      effort: { ...DEFAULT_EFFORT_RULE_CONFIG, baseMinutesPerCase: 7 },
      grouping: { enabled: true, maxWeBelegGap: 1 },
      shiftEnd: { autoCutoffMinutes: 120 },
      loadPlan: [],
    });
    expect(config.priority.overdueLeadDays).toBe(3);
    expect(config.priority.overdueLeadDaysOverrides).toEqual([{ shopAreaNo: '21', leadDays: 5 }]);
    // The cockpit-edited effort parameters are threaded through to the engine config.
    expect(config.effort.baseMinutesPerCase).toBe(7);
  });
});
