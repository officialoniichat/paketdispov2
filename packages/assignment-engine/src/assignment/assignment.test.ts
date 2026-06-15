import { describe, expect, it } from 'vitest';
import {
  employeeShiftSchema,
  goodsReceiptCaseSchema,
  type EmployeeShift,
  type GoodsReceiptCase,
} from '@paket/domain-types';
import { canConsumeReserve, computeIronReserve } from './reserve.js';
import { createBalancedBundles } from './bundling.js';
import { distributeBundlesByWeightedLoad } from './distribute.js';
import type { EnrichedCase } from '../types.js';
import { DEFAULT_ASSIGNMENT_CONFIG } from '../config.js';

function makeCase(id: string): GoodsReceiptCase {
  return goodsReceiptCaseSchema.parse({
    id,
    documentSetId: 'ds',
    weBelegNo: `WE-${id}`,
    bookingDate: '2026-06-15',
    branchNo: '001',
    storageLocation: { id: `loc-${id}`, type: 'regal', code: `R${id}`, active: true },
    section: null,
    priorityFlags: [],
    totalQuantity: 10,
    status: 'ready',
    effortPoints: 0,
    estimatedMinutes: 0,
    version: 0,
  });
}

function enriched(id: string, minutes: number, wgr = 'default'): EnrichedCase {
  return {
    case: makeCase(id),
    priority: { rank: 6, class: 'fifo', reason: 'fifo' },
    effortMinutes: minutes,
    effortPoints: minutes,
    wgrCodes: [wgr],
    fromPreviousDays: false,
  };
}

function shift(employeeId: string, capacity: number): EmployeeShift {
  return employeeShiftSchema.parse({
    id: `shift-${employeeId}`,
    employeeId,
    date: '2026-06-15',
    plannedStart: '2026-06-15T06:00:00+02:00',
    plannedEnd: '2026-06-15T14:30:00+02:00',
    breakMinutes: 30,
    plannedHours: 8,
    netCapacityMinutes: capacity,
    active: true,
  });
}

describe('computeIronReserve (Anhang B.2)', () => {
  it('takes the percentage when it dominates', () => {
    const r = computeIronReserve({ plannedEmployeeCount: 5, nextMorningCapacityMinutes: 2400 });
    expect(r.byPercentage).toBe(480); // 0.20 * 2400
    expect(r.byMinimumPerEmployee).toBe(300); // 60 * 5
    expect(r.minutes).toBe(480);
  });

  it('takes the per-employee minimum when it dominates', () => {
    const r = computeIronReserve({ plannedEmployeeCount: 10, nextMorningCapacityMinutes: 1000 });
    expect(r.minutes).toBe(600); // max(200, 600)
  });

  it('returns zero when disabled', () => {
    const r = computeIronReserve({
      plannedEmployeeCount: 5,
      nextMorningCapacityMinutes: 2400,
      config: {
        enabled: false,
        mode: 'max_of_percentage_and_minutes_per_employee',
        percentageOfNextMorningCapacity: 0.2,
        minimumMinutesPerPlannedEmployee: 60,
        overrideAllowedFor: [],
      },
    });
    expect(r.minutes).toBe(0);
  });

  it('lets Prio/CatMan override the reserve but not plain FIFO', () => {
    expect(canConsumeReserve(['prio'])).toBe(true);
    expect(canConsumeReserve(['catman_due'])).toBe(true);
    expect(canConsumeReserve(['same_day_required'])).toBe(false);
    expect(canConsumeReserve([])).toBe(false);
  });
});

describe('createBalancedBundles (§8.3)', () => {
  it('packs cases up to the target minutes, preserving order', () => {
    const cases = [enriched('1', 30), enriched('2', 30), enriched('3', 30), enriched('4', 30)];
    const { bundles } = createBalancedBundles(cases, 1000, {
      ...DEFAULT_ASSIGNMENT_CONFIG,
      targetBundleMinutes: 55,
      maxCasesPerBundle: 6,
    });
    // 30+30 = 60 >= 55 closes bundle → two cases per bundle
    expect(bundles).toHaveLength(2);
    expect(bundles[0]?.caseIds).toEqual(['1', '2']);
    expect(bundles[0]?.effortMinutes).toBe(60);
  });

  it('respects the max-cases-per-bundle cap', () => {
    const cases = Array.from({ length: 6 }, (_, i) => enriched(String(i), 5));
    const { bundles } = createBalancedBundles(cases, 1000, {
      ...DEFAULT_ASSIGNMENT_CONFIG,
      targetBundleMinutes: 999,
      maxCasesPerBundle: 3,
    });
    expect(bundles.map((b) => b.caseIds.length)).toEqual([3, 3]);
  });

  it('routes cases beyond capacity into overflow (allowing a single-case overshoot)', () => {
    const cases = [enriched('1', 40), enriched('2', 40), enriched('3', 40)];
    const { bundles, overflow } = createBalancedBundles(cases, 50, DEFAULT_ASSIGNMENT_CONFIG);
    // case 1 fits; case 2 is added since used (40) < 50, pushing used to 80; case 3 overflows.
    expect(bundles.flatMap((b) => b.caseIds)).toEqual(['1', '2']);
    expect(overflow.map((c) => c.case.id)).toEqual(['3']);
  });

  it('flags a bundle that contains a heavy case and computes the dominant WGR', () => {
    const cases = [enriched('1', 50, 'socks'), enriched('2', 5, 'socks')];
    const { bundles } = createBalancedBundles(cases, 1000, {
      ...DEFAULT_ASSIGNMENT_CONFIG,
      targetBundleMinutes: 999,
      maxCasesPerBundle: 6,
      heavyCaseMinutes: 45,
    });
    expect(bundles[0]?.containsHeavy).toBe(true);
    expect(bundles[0]?.dominantWgr).toBe('socks');
  });
});

describe('distributeBundlesByWeightedLoad (§8.3/§8.4)', () => {
  function protosOf(...specs: Array<[string, number, string]>) {
    return specs.map(
      ([id, minutes, wgr]) =>
        createBalancedBundles([enriched(id, minutes, wgr)], 1000, {
          ...DEFAULT_ASSIGNMENT_CONFIG,
          targetBundleMinutes: 1,
          maxCasesPerBundle: 1,
        }).bundles[0]!,
    );
  }

  it('balances equal proto-bundles evenly, then merges into one bundle per employee', () => {
    const protos = protosOf(['1', 50, 'a'], ['2', 50, 'a'], ['3', 50, 'a'], ['4', 50, 'a']);
    const result = distributeBundlesByWeightedLoad(
      [shift('E-1', 480), shift('E-2', 480)],
      protos,
      '2026-06-15',
    );
    // Fairness unchanged (LPT spreads the 4 equal protos 2+2), but each employee
    // ends with exactly ONE merged AssignmentBundle carrying both their cases.
    expect(result.bundles).toHaveLength(2);
    const sizes = result.bundles.map((b) => b.caseIds.length).sort();
    expect(sizes).toEqual([2, 2]);
    const counts = result.loads.map((l) => l.bundleCount).sort();
    expect(counts).toEqual([1, 1]);
    expect(new Set(result.bundles.map((b) => b.employeeId)).size).toBe(2);
    expect(result.unassigned).toHaveLength(0);
  });

  it('emits one stable bundle id per employee (bundle-<date>-<index>)', () => {
    const protos = protosOf(['1', 50, 'a'], ['2', 50, 'a'], ['3', 50, 'a'], ['4', 50, 'a']);
    const result = distributeBundlesByWeightedLoad(
      [shift('E-1', 480), shift('E-2', 480)],
      protos,
      '2026-06-15',
    );
    for (const b of result.bundles) {
      expect(b.id).toMatch(/^bundle-2026-06-15-\d{4}$/);
    }
    // One bundle id per employee — ids are unique.
    expect(new Set(result.bundles.map((b) => b.id)).size).toBe(result.bundles.length);
  });

  it('spreads distinct Warengruppen to avoid specialists', () => {
    const protos = protosOf(['1', 30, 'wgrA'], ['2', 30, 'wgrA'], ['3', 30, 'wgrB'], ['4', 30, 'wgrB']);
    const result = distributeBundlesByWeightedLoad(
      [shift('E-1', 480), shift('E-2', 480)],
      protos,
      '2026-06-15',
      { avoidSpecialists: true },
    );
    // Each employee should end up handling both WGRs rather than specialising.
    for (const load of result.loads) {
      expect(load.distinctWgrCount).toBe(2);
    }
  });

  it('returns all bundles as unassigned when no employee is active', () => {
    const protos = protosOf(['1', 30, 'a']);
    const result = distributeBundlesByWeightedLoad([], protos, '2026-06-15');
    expect(result.bundles).toHaveLength(0);
    expect(result.unassigned).toHaveLength(1);
  });

  it('is deterministic across runs', () => {
    const build = () => protosOf(['1', 50, 'a'], ['2', 20, 'b'], ['3', 35, 'c']);
    const a = distributeBundlesByWeightedLoad(
      [shift('E-1', 480), shift('E-2', 300)],
      build(),
      '2026-06-15',
    );
    const b = distributeBundlesByWeightedLoad(
      [shift('E-1', 480), shift('E-2', 300)],
      build(),
      '2026-06-15',
    );
    expect(a.bundles.map((x) => `${x.id}:${x.employeeId}`)).toEqual(
      b.bundles.map((x) => `${x.id}:${x.employeeId}`),
    );
  });
});
