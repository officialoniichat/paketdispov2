import { describe, expect, it } from 'vitest';
import {
  employeeShiftSchema,
  goodsReceiptCaseSchema,
  type EmployeeShift,
  type GoodsReceiptCase,
  type PriorityFlag,
  type SectionCode,
} from '@paket/domain-types';
import { computeReserveStatus } from './reserve.js';

const DATE = '2026-06-16';

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

function shift(employeeId: string): EmployeeShift {
  return employeeShiftSchema.parse({
    id: `shift-${employeeId}`,
    employeeId,
    date: DATE,
    plannedStart: `${DATE}T07:00:00.000Z`,
    plannedEnd: `${DATE}T15:00:00.000Z`,
    breakMinutes: 30,
    plannedHours: 8,
    netCapacityMinutes: 450,
    active: true,
  });
}

describe('computeReserveStatus (Reserve & Starterpaket concept §5/§6)', () => {
  it('targets earlyShiftWorkerCount × morningGapMinutes (default 105)', () => {
    const status = computeReserveStatus({
      cases: [],
      shifts: [shift('e1'), shift('e2'), shift('e3')],
      date: DATE,
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
      shifts: [shift('e1'), shift('e2'), shift('e3')],
      date: DATE,
    });
    expect(status.targetMinutes).toBe(315);
    expect(status.securedMinutes).toBe(360); // raw eligible backlog
    expect(status.satisfied).toBe(true);
  });

  it('is NOT satisfied when the holdable backlog falls short', () => {
    const cases = [makeCase({ id: 'a', estimatedMinutes: 100 })];
    const status = computeReserveStatus({
      cases,
      shifts: [shift('e1'), shift('e2'), shift('e3')],
      date: DATE,
    });
    expect(status.targetMinutes).toBe(315);
    expect(status.securedMinutes).toBe(100);
    expect(status.satisfied).toBe(false);
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
      shifts: [shift('e1')],
      date: DATE,
    });
    expect(status.targetMinutes).toBe(105);
    expect(status.securedMinutes).toBe(80); // only the holdable one
    expect(status.satisfied).toBe(false);
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
      shifts: [shift('e1')],
      date: DATE,
    });
    expect(status.securedMinutes).toBe(90);
    expect(status.satisfied).toBe(false);
  });

  it('only counts ready cases', () => {
    const cases = [
      makeCase({ id: 'ready', estimatedMinutes: 200 }),
      makeCase({ id: 'assigned', estimatedMinutes: 200, status: 'assigned' }),
    ];
    const status = computeReserveStatus({
      cases,
      shifts: [shift('e1')],
      date: DATE,
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
      shifts: [shift('e1')],
      date: DATE,
    });
    expect(status.targetMinutes).toBe(105);
    expect(status.starterBelegCount).toBe(2);
    expect(status.starterMinutes).toBe(120);
  });

  it('with no shifts the target is 0 and the reserve is trivially satisfied', () => {
    const status = computeReserveStatus({
      cases: [makeCase({ id: 'a', estimatedMinutes: 50 })],
      shifts: [],
      date: DATE,
    });
    expect(status.targetMinutes).toBe(0);
    expect(status.satisfied).toBe(true);
  });
});
