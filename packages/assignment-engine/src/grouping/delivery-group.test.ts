import { describe, expect, it } from 'vitest';
import {
  employeeShiftSchema,
  goodsReceiptCaseSchema,
  type EmployeeShift,
  type GoodsReceiptCase,
} from '@paket/domain-types';
import {
  DEFAULT_GROUPING_CONFIG,
  detectDeliveryGroups,
  indexDeliveryGroups,
  type DeliveryGroupInput,
} from './delivery-group.js';
import { createBalancedBundles } from '../assignment/bundling.js';
import { distributeBundlesByWeightedLoad } from '../assignment/distribute.js';
import { DEFAULT_ASSIGNMENT_CONFIG } from '../config.js';
import type { EnrichedCase } from '../types.js';

function input(id: string, weBelegNo: string, deliveryNoteNo?: string): DeliveryGroupInput {
  return { id, weBelegNo, deliveryNoteNo };
}

describe('detectDeliveryGroups (Teamlead-Anforderung Punkt 1)', () => {
  it('groups Belege that share the same deliveryNoteNo', () => {
    const groups = detectDeliveryGroups([
      input('a', '3.551.001', 'LS-77'),
      input('b', '3.551.900', 'LS-77'),
      input('c', '3.551.500', 'LS-99'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['a', 'b']);
    expect(groups[0]?.reason).toBe('delivery_note');
  });

  it('groups a consecutive weBelegNo run (3.551.119 … 3.551.122)', () => {
    const groups = detectDeliveryGroups([
      input('w1', '3.551.119'),
      input('w2', '3.551.120'),
      input('w3', '3.551.121'),
      input('w4', '3.551.122'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(groups[0]?.id).toBe('dg-3551119');
    expect(groups[0]?.reason).toBe('beleg_run');
  });

  it('does NOT group when the weBelegNo gap exceeds the threshold', () => {
    const groups = detectDeliveryGroups(
      [input('x', '3.551.119'), input('y', '3.551.121')],
      { enabled: true, maxWeBelegGap: 1 },
    );
    expect(groups).toHaveLength(0);
  });

  it('splits a run where a gap interrupts it, keeping the consecutive part', () => {
    const groups = detectDeliveryGroups([
      input('a', '100'),
      input('b', '101'),
      input('c', '200'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['a', 'b']);
  });

  it('treats a single Beleg as no group', () => {
    expect(detectDeliveryGroups([input('solo', '500')])).toEqual([]);
  });

  it('returns nothing when disabled', () => {
    const groups = detectDeliveryGroups(
      [input('a', '1'), input('b', '2')],
      { enabled: false, maxWeBelegGap: 1 },
    );
    expect(groups).toEqual([]);
  });

  it('merges deliveryNoteNo and run signals into one component (mixed)', () => {
    // a–b linked by a run; b–c linked by a shared note ⇒ one group {a,b,c}.
    const groups = detectDeliveryGroups([
      input('a', '700'),
      input('b', '701', 'LS-5'),
      input('c', '999', 'LS-5'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['a', 'b', 'c']);
    expect(groups[0]?.reason).toBe('mixed');
  });

  it('is deterministic across runs and input order', () => {
    const a = detectDeliveryGroups([input('w2', '120'), input('w1', '119'), input('w3', '121')]);
    const b = detectDeliveryGroups([input('w1', '119'), input('w3', '121'), input('w2', '120')]);
    expect(a).toEqual(b);
    expect(a[0]?.caseIds).toEqual(['w1', 'w2', 'w3']);
  });

  it('uses the default config when none is supplied', () => {
    expect(DEFAULT_GROUPING_CONFIG).toEqual({ enabled: true, maxWeBelegGap: 1 });
    const groups = detectDeliveryGroups([input('a', '10'), input('b', '11')]);
    expect(groups).toHaveLength(1);
  });
});

describe('indexDeliveryGroups', () => {
  it('maps every member case to its group id and records the size', () => {
    const groups = detectDeliveryGroups([
      input('a', '119'),
      input('b', '120'),
      input('c', '121'),
    ]);
    const { groupIdByCaseId, sizeByGroupId } = indexDeliveryGroups(groups);
    expect(groupIdByCaseId.get('a')).toBe('dg-119');
    expect(groupIdByCaseId.get('b')).toBe('dg-119');
    expect(sizeByGroupId.get('dg-119')).toBe(3);
  });
});

// --- Distribution bias --------------------------------------------------------

function makeCase(id: string): GoodsReceiptCase {
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
    totalQuantity: 10,
    status: 'ready',
    effortPoints: 0,
    estimatedMinutes: 0,
    version: 0,
  });
}

function enriched(id: string, minutes: number): EnrichedCase {
  return {
    case: makeCase(id),
    priority: { rank: 6, class: 'fifo', reason: 'fifo' },
    effortMinutes: minutes,
    effortPoints: minutes,
    wgrCodes: ['default'],
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

/** One proto-bundle per single case (mirrors the engine's smallest unit). */
function protosOf(...ids: string[]) {
  return ids.map(
    (id) =>
      createBalancedBundles([enriched(id, 30)], 1000, {
        ...DEFAULT_ASSIGNMENT_CONFIG,
        targetBundleMinutes: 1,
        maxCasesPerBundle: 1,
      }).bundles[0]!,
  );
}

describe('distributeBundlesByWeightedLoad — delivery-group affinity', () => {
  it('keeps a delivery group on ONE employee when capacity allows', () => {
    const protos = protosOf('1', '2');
    const groupIdByCaseId = new Map([
      ['1', 'dg-1'],
      ['2', 'dg-1'],
    ]);
    const result = distributeBundlesByWeightedLoad(
      [shift('E-1', 1000), shift('E-2', 1000)],
      protos,
      '2026-06-15',
      { groupIdByCaseId },
    );
    // Both group members land in a single employee's merged bundle.
    expect(result.bundles).toHaveLength(1);
    expect([...result.bundles[0]!.caseIds].sort()).toEqual(['1', '2']);
  });

  it('without the group map, equal protos spread across both employees', () => {
    const protos = protosOf('1', '2');
    const result = distributeBundlesByWeightedLoad(
      [shift('E-1', 1000), shift('E-2', 1000)],
      protos,
      '2026-06-15',
    );
    expect(result.bundles).toHaveLength(2);
  });

  it('splits a group that no longer fits one shift (capacity beats the soft bias)', () => {
    // Two 30-min protos but each employee can only hold ~one ⇒ the load ratio jump
    // (30/35 ≈ 0.857) dwarfs the affinity bonus, so the group is split, not blocked.
    const protos = protosOf('1', '2');
    const groupIdByCaseId = new Map([
      ['1', 'dg-1'],
      ['2', 'dg-1'],
    ]);
    const result = distributeBundlesByWeightedLoad(
      [shift('E-1', 35), shift('E-2', 35)],
      protos,
      '2026-06-15',
      { groupIdByCaseId },
    );
    expect(result.bundles).toHaveLength(2);
  });
});
