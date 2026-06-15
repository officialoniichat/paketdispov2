import { describe, expect, it } from 'vitest';
import {
  goodsReceiptCaseSchema,
  type GoodsReceiptCase,
  type PriorityFlag,
  type SectionCode,
} from '@paket/domain-types';
import { computeReserveStatus, type ReserveRuleValues } from './reserve.js';

const DATE = '2026-06-16';

/** Admin/Regeln reserve defaults the engine is driven by (single source of truth). */
const RULE: ReserveRuleValues = {
  enabled: true,
  morningGapMinutes: 105,
  neverReserveSections: [4, 7, 8],
  neverReserveFlags: ['prio', 'catman_due', 'overdue', 'manual_teamlead_priority'],
  respectDeadlines: true,
};

interface CaseOverrides {
  id: string;
  estimatedMinutes: number;
  section?: SectionCode | null;
  priorityFlags?: PriorityFlag[];
  catManDate?: string;
  loadPlanDate?: string;
  bookingDate?: string;
  status?: GoodsReceiptCase['status'];
}

function makeCase(o: CaseOverrides): GoodsReceiptCase {
  return goodsReceiptCaseSchema.parse({
    id: o.id,
    documentSetId: 'ds',
    weBelegNo: `WE-${o.id}`,
    bookingDate: o.bookingDate ?? '2026-06-10',
    branchNo: '001',
    storageLocation: { id: `loc-${o.id}`, type: 'regal', code: `R${o.id}`, active: true },
    section: o.section ?? 1,
    priorityFlags: o.priorityFlags ?? [],
    catManDate: o.catManDate,
    loadPlanDate: o.loadPlanDate,
    totalQuantity: 10,
    status: o.status ?? 'ready',
    effortPoints: o.estimatedMinutes,
    estimatedMinutes: o.estimatedMinutes,
    version: 0,
  });
}

describe('computeReserveStatus (Reserve & Starterpaket concept §5/§6)', () => {
  it('targets earlyShiftWorkerCount × morningGapMinutes (default 105)', () => {
    const status = computeReserveStatus({
      cases: [],
      earlyShiftWorkerCount: 3,
      date: DATE,
      rule: RULE,
    });
    expect(status.targetMinutes).toBe(315); // 3 × 105
  });

  it('is satisfied when the holdable backlog meets the target', () => {
    const cases = [
      makeCase({ id: 'a', estimatedMinutes: 120 }),
      makeCase({ id: 'b', estimatedMinutes: 120 }),
      makeCase({ id: 'c', estimatedMinutes: 120 }),
    ];
    const status = computeReserveStatus({
      cases,
      earlyShiftWorkerCount: 3,
      date: DATE,
      rule: RULE,
    });
    expect(status.targetMinutes).toBe(315);
    expect(status.securedMinutes).toBe(360); // raw eligible backlog
    expect(status.state).toBe('satisfied');
  });

  it('is at_risk when the holdable backlog falls short of a positive target', () => {
    const cases = [makeCase({ id: 'a', estimatedMinutes: 100 })];
    const status = computeReserveStatus({
      cases,
      earlyShiftWorkerCount: 3,
      date: DATE,
      rule: RULE,
    });
    expect(status.targetMinutes).toBe(315);
    expect(status.securedMinutes).toBe(100);
    expect(status.state).toBe('at_risk');
  });

  it('reports disabled when the reserve rule is switched off (no target, no hold)', () => {
    const status = computeReserveStatus({
      cases: [makeCase({ id: 'a', estimatedMinutes: 200 })],
      earlyShiftWorkerCount: 3,
      date: DATE,
      rule: { ...RULE, enabled: false },
    });
    expect(status.state).toBe('disabled');
    expect(status.targetMinutes).toBe(0);
    expect(status.securedMinutes).toBe(0);
    expect(status.starterBelegCount).toBe(0);
  });

  it('reports no_early_shift (NOT satisfied) when there is no early-shift worker', () => {
    const status = computeReserveStatus({
      cases: [makeCase({ id: 'a', estimatedMinutes: 50 })],
      earlyShiftWorkerCount: 0,
      date: DATE,
      rule: RULE,
    });
    expect(status.state).toBe('no_early_shift');
    expect(status.targetMinutes).toBe(0);
  });

  it('excludes urgent / never-holdable cases from the secured backlog', () => {
    const cases = [
      makeCase({ id: 'nos4', estimatedMinutes: 200, section: 4 }),
      makeCase({ id: 'extra7', estimatedMinutes: 200, section: 7 }),
      makeCase({ id: 'nosno8', estimatedMinutes: 200, section: 8 }),
      makeCase({ id: 'prio', estimatedMinutes: 200, priorityFlags: ['prio'] }),
      makeCase({ id: 'catman', estimatedMinutes: 200, priorityFlags: ['catman_due'] }),
      makeCase({ id: 'overdue', estimatedMinutes: 200, priorityFlags: ['overdue'] }),
      makeCase({ id: 'manual', estimatedMinutes: 200, priorityFlags: ['manual_teamlead_priority'] }),
      makeCase({ id: 'ok', estimatedMinutes: 80 }),
    ];
    const status = computeReserveStatus({
      cases,
      earlyShiftWorkerCount: 1,
      date: DATE,
      rule: RULE,
    });
    expect(status.targetMinutes).toBe(105);
    expect(status.securedMinutes).toBe(80); // only the holdable one
    expect(status.state).toBe('at_risk');
  });

  it('treats a case as not deadline-safe when holding breaches catManDate/loadPlanDate', () => {
    const cases = [
      // loadPlanDate is the planning day -> holding overnight would breach it.
      makeCase({ id: 'duesoon', estimatedMinutes: 200, loadPlanDate: DATE }),
      // catManDate already today -> not deadline-safe.
      makeCase({ id: 'catmandue', estimatedMinutes: 200, catManDate: DATE }),
      // far-out deadline -> holdable.
      makeCase({ id: 'far', estimatedMinutes: 90, loadPlanDate: '2026-06-30' }),
    ];
    const status = computeReserveStatus({
      cases,
      earlyShiftWorkerCount: 1,
      date: DATE,
      rule: RULE,
    });
    expect(status.securedMinutes).toBe(90);
    expect(status.state).toBe('at_risk');
  });

  it('respectDeadlines=false lets near-deadline cases secure the reserve', () => {
    const cases = [makeCase({ id: 'duesoon', estimatedMinutes: 200, loadPlanDate: DATE })];
    const status = computeReserveStatus({
      cases,
      earlyShiftWorkerCount: 1,
      date: DATE,
      rule: { ...RULE, respectDeadlines: false },
    });
    expect(status.securedMinutes).toBe(200);
    expect(status.state).toBe('satisfied');
  });

  it('only counts ready cases', () => {
    const cases = [
      makeCase({ id: 'ready', estimatedMinutes: 200 }),
      makeCase({ id: 'assigned', estimatedMinutes: 200, status: 'assigned' }),
    ];
    const status = computeReserveStatus({
      cases,
      earlyShiftWorkerCount: 1,
      date: DATE,
      rule: RULE,
    });
    expect(status.securedMinutes).toBe(200);
  });

  it('builds a starter capped at the target worth of holdable belege, ordered by loadPlanDate then bookingDate', () => {
    const cases = [
      makeCase({ id: 'late', estimatedMinutes: 60, loadPlanDate: '2026-06-30', bookingDate: '2026-06-12' }),
      makeCase({ id: 'early', estimatedMinutes: 60, loadPlanDate: '2026-06-20', bookingDate: '2026-06-09' }),
      makeCase({ id: 'mid', estimatedMinutes: 60, loadPlanDate: '2026-06-20', bookingDate: '2026-06-11' }),
      makeCase({ id: 'spare', estimatedMinutes: 60, loadPlanDate: '2026-07-01', bookingDate: '2026-06-13' }),
    ];
    // 1 worker -> target 105. Cumulative: 60, then 120 (>= 105) -> 2 belege.
    const status = computeReserveStatus({
      cases,
      earlyShiftWorkerCount: 1,
      date: DATE,
      rule: RULE,
    });
    expect(status.targetMinutes).toBe(105);
    expect(status.starterBelegCount).toBe(2);
    expect(status.starterMinutes).toBe(120);
  });
});
