import { describe, expect, it } from 'vitest';
import {
  employeeShiftSchema,
  goodsReceiptCaseSchema,
  type EmployeeShift,
  type GoodsReceiptCase,
} from '@paket/domain-types';
import { createBalancedBundles } from './bundling.js';
import { distributeBundlesByWeightedLoad } from './distribute.js';
import type { EnrichedCase } from '../types.js';
import { DEFAULT_ASSIGNMENT_CONFIG } from '../config.js';

function makeCase(id: string, totalQuantity: number): GoodsReceiptCase {
  return goodsReceiptCaseSchema.parse({
    id,
    source: 'prohandel_api',
    externalRef: `WE-${id}`,
    weBelegNo: `WE-${id}`,
    bookingDate: '2026-06-15',
    branchNo: '001',
    storageLocation: { id: `loc-${id}`, type: 'regal', code: `R${id}`, active: true },
    section: null,
    priorityFlags: [],
    totalQuantity,
    status: 'ready',
    effortPoints: 0,
    estimatedMinutes: 0,
    version: 0,
  });
}

function enriched(id: string, teile: number, minutes: number, wgr = 'default'): EnrichedCase {
  return {
    case: makeCase(id, teile),
    priority: { rank: 6, class: 'fifo', reason: 'fifo' },
    teile,
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

describe('createBalancedBundles — Teile-Dimensionierung (§8.3, C1/C2)', () => {
  it('packs cases up to the Starter-Pack-Teile, preserving order', () => {
    // 4 × 120 Teile: 120+120 = 240 ≥ 200 (min) und ≤ 250 (max) → 2er-Packs.
    const cases = [
      enriched('1', 120, 30),
      enriched('2', 120, 30),
      enriched('3', 120, 30),
      enriched('4', 120, 30),
    ];
    const { bundles } = createBalancedBundles(cases, 1000, DEFAULT_ASSIGNMENT_CONFIG, 'starter');
    expect(bundles).toHaveLength(2);
    expect(bundles[0]?.caseIds).toEqual(['1', '2']);
    expect(bundles[0]?.teile).toBe(240);
    expect(bundles[0]?.effortMinutes).toBe(60);
  });

  it('closes a pack BEFORE exceeding the max Teile', () => {
    // 180 + 120 = 300 > 250 (max) → der zweite Beleg beginnt ein neues Pack.
    const cases = [enriched('1', 180, 10), enriched('2', 120, 10), enriched('3', 120, 10)];
    const { bundles } = createBalancedBundles(cases, 1000, DEFAULT_ASSIGNMENT_CONFIG, 'starter');
    expect(bundles[0]?.caseIds).toEqual(['1']);
    expect(bundles[1]?.caseIds).toEqual(['2', '3']);
  });

  it('has NO case cap: many small NOS-Einzelanlieferungen fit in one pack (C2)', () => {
    // 20 Belege à 10 Teile = 200 Teile → EIN Pack mit 20 Belegen (früher: max 6-8).
    const cases = Array.from({ length: 20 }, (_, i) => enriched(String(i), 10, 2));
    const { bundles } = createBalancedBundles(cases, 1000, DEFAULT_ASSIGNMENT_CONFIG, 'starter');
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.caseIds).toHaveLength(20);
    expect(bundles[0]?.teile).toBe(200);
  });

  it('uses the smaller Folge-Pack sizes for kind follow_up', () => {
    const cases = [enriched('1', 45, 10), enriched('2', 45, 10), enriched('3', 45, 10)];
    const { bundles } = createBalancedBundles(cases, 1000, DEFAULT_ASSIGNMENT_CONFIG, 'follow_up');
    // 45+45 = 90 ≥ 80 (follow-up min) → 2er-Pack.
    expect(bundles[0]?.caseIds).toEqual(['1', '2']);
    expect(bundles[0]?.teile).toBe(90);
  });

  it('routes cases beyond the MINUTES budget into overflow (Aufwandsmodell bleibt Machbarkeits-Gate)', () => {
    const cases = [enriched('1', 50, 40), enriched('2', 50, 40), enriched('3', 50, 40)];
    const { bundles, overflow } = createBalancedBundles(cases, 50, DEFAULT_ASSIGNMENT_CONFIG);
    // case 1 fits; case 2 is added since used (40) < 50, pushing used to 80; case 3 overflows.
    expect(bundles.flatMap((b) => b.caseIds)).toEqual(['1', '2']);
    expect(overflow.map((c) => c.case.id)).toEqual(['3']);
  });

  it('computes the dominant WGR of a pack', () => {
    const cases = [enriched('1', 100, 50, 'socks'), enriched('2', 100, 5, 'socks')];
    const { bundles } = createBalancedBundles(cases, 1000, DEFAULT_ASSIGNMENT_CONFIG);
    expect(bundles[0]?.dominantWgr).toBe('socks');
  });
});

describe('distributeBundlesByWeightedLoad — ein Starter-Pack je Mitarbeiter (§8.3/§8.4, C3)', () => {
  function protosOf(...specs: Array<[string, number, string]>) {
    return specs.map(
      ([id, minutes, wgr]) =>
        createBalancedBundles([enriched(id, 200, minutes, wgr)], 1000, DEFAULT_ASSIGNMENT_CONFIG)
          .bundles[0]!,
    );
  }

  it('assigns exactly ONE pack per employee; the rest stays unassigned (pool)', () => {
    const protos = protosOf(['1', 50, 'a'], ['2', 50, 'a'], ['3', 50, 'a'], ['4', 50, 'a']);
    const result = distributeBundlesByWeightedLoad(
      [shift('E-1', 480), shift('E-2', 480)],
      protos,
      '2026-06-15',
    );
    expect(result.bundles).toHaveLength(2);
    const sizes = result.bundles.map((b) => b.caseIds.length).sort();
    expect(sizes).toEqual([1, 1]);
    const counts = result.loads.map((l) => l.bundleCount).sort();
    expect(counts).toEqual([1, 1]);
    expect(new Set(result.bundles.map((b) => b.employeeId)).size).toBe(2);
    // Die beiden übrigen Packs warten im Pool auf den Self-Pull.
    expect(result.unassigned).toHaveLength(2);
  });

  it('emits one stable bundle id per employee (bundle-<date>-<index>)', () => {
    const protos = protosOf(['1', 50, 'a'], ['2', 50, 'a']);
    const result = distributeBundlesByWeightedLoad(
      [shift('E-1', 480), shift('E-2', 480)],
      protos,
      '2026-06-15',
    );
    for (const b of result.bundles) {
      expect(b.id).toMatch(/^bundle-2026-06-15-\d{4}$/);
    }
    expect(new Set(result.bundles.map((b) => b.id)).size).toBe(result.bundles.length);
  });

  it('does not hand an employee a pack that exceeds their net capacity minutes', () => {
    const protos = protosOf(['1', 400, 'a']);
    const result = distributeBundlesByWeightedLoad([shift('E-1', 300)], protos, '2026-06-15');
    expect(result.bundles).toHaveLength(0);
    expect(result.unassigned).toHaveLength(1);
  });

  it('returns all packs as unassigned when no employee is active', () => {
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
