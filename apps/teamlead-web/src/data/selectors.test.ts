import { describe, expect, it } from 'vitest';
import { loadMockDataset } from './mock.js';
import {
  buildBoardRows,
  buildCockpitSummary,
  buildLanes,
  laneForCase,
  simulateRecalculation,
} from './selectors.js';
import type { Lane, LaneId } from './types.js';

const ds = loadMockDataset();

function lane(lanes: Lane[], id: LaneId): Lane {
  const l = lanes.find((x) => x.id === id);
  if (!l) throw new Error(`lane ${id} missing`);
  return l;
}

describe('buildCockpitSummary (§10.1)', () => {
  const s = buildCockpitSummary(ds);

  it('sums net capacity from active shifts', () => {
    expect(s.capacity.netCapacityMinutes).toBe(480 + 300 + 420);
    expect(s.capacity.plannedEmployees).toBe(3);
  });

  it('derives reserve as net minus planned', () => {
    expect(s.capacity.reserveMinutes).toBe(
      s.capacity.netCapacityMinutes - s.capacity.plannedMinutes,
    );
  });

  it('counts the open pool by flag', () => {
    expect(s.pool.prio).toBe(2);
    expect(s.pool.overdue).toBe(1);
    expect(s.pool.catManDue).toBe(1);
    expect(s.pool.openIssues).toBe(3);
  });

  it('reports ZST progress from completed cases', () => {
    expect(s.zst.completedCases).toBe(2);
    expect(s.zst.totalCases).toBe(ds.cases.length);
  });
});

describe('buildLanes (§10.2)', () => {
  const lanes = buildLanes(ds);

  it('places each open case in exactly one lane', () => {
    const total = lanes.reduce((n, l) => n + l.cards.length, 0);
    const open = ds.cases.filter((c) => !['completed', 'zst_done', 'cancelled'].includes(c.status));
    expect(total).toBe(open.length);
  });

  it('routes problems and parked/needs-review by precedence', () => {
    expect(lane(lanes, 'probleme').cards.length).toBe(2);
    expect(lane(lanes, 'needs_review').cards.map((c) => c.caseId)).toEqual(['case-11']);
    expect(lane(lanes, 'geparkt').cards.map((c) => c.caseId)).toEqual(['case-10']);
  });

  it('separates Verladeplan heute/morgen and Jeden-Tag-Ware', () => {
    expect(lane(lanes, 'verladeplan_heute').cards.length).toBe(2);
    expect(lane(lanes, 'verladeplan_morgen').cards.map((c) => c.caseId)).toEqual(['case-08']);
    expect(lane(lanes, 'jeden_tag').cards.length).toBe(2);
  });

  it('keeps Prio out of a section (Prio != Abschnitt)', () => {
    const prio = lane(lanes, 'prio');
    expect(prio.cards.some((c) => c.caseId === 'case-01')).toBe(true);
    const c1 = ds.cases.find((c) => c.id === 'case-01')!;
    expect(laneForCase(c1, ds)).toBe('prio');
    expect(c1.section).toBeNull();
  });
});

describe('buildBoardRows (§10.3)', () => {
  const board = buildBoardRows(ds);

  it('computes utilisation and schwer/leicht mix per employee', () => {
    const anna = board.find((r) => r.employeeId === 'emp-anna')!;
    expect(anna.netCapacityMinutes).toBe(480);
    expect(anna.assignedMinutes).toBe(76);
    expect(anna.heavyCaseCount + anna.lightCaseCount).toBe(3);
  });
});

describe('simulateRecalculation (§E.4)', () => {
  const result = simulateRecalculation(ds);

  it('assigns the open ready pool and shrinks the reserve', () => {
    expect(result.newlyAssigned).toBe(6);
    expect(result.unassignedRemaining).toBe(0);
    expect(result.reserveAfterMinutes).toBeLessThan(result.reserveBeforeMinutes);
  });

  it('reports a before/after delta per employee', () => {
    expect(result.perEmployee).toHaveLength(ds.employees.length);
    const totalDelta = result.perEmployee.reduce((n, p) => n + p.deltaMinutes, 0);
    expect(totalDelta).toBeGreaterThan(0);
  });
});
