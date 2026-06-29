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
  withheldCaseIds,
  type DeliveryGroupInput,
  type GroupingConfig,
} from './delivery-group.js';
import { createBalancedBundles } from '../assignment/bundling.js';
import { distributeBundlesByWeightedLoad } from '../assignment/distribute.js';
import { DEFAULT_ASSIGNMENT_CONFIG } from '../config.js';
import type { EnrichedCase } from '../types.js';

function input(
  id: string,
  weBelegNo: string,
  extra: Partial<DeliveryGroupInput> = {},
): DeliveryGroupInput {
  return { id, weBelegNo, ...extra };
}

/** Full GroupingConfig with overrides — keeps tests readable as the schema grows. */
function cfg(partial: Partial<GroupingConfig> = {}): GroupingConfig {
  return { ...DEFAULT_GROUPING_CONFIG, ...partial };
}

describe('detectDeliveryGroups — tiered signals (Teamlead-Anforderung Punkt 1)', () => {
  it('T1 source: groups by deliverySourceGroupKey and reports confidence=confirmed', () => {
    const groups = detectDeliveryGroups([
      input('a', '3.551.001', { deliverySourceGroupKey: 'D-1', deliverySourceGroupSize: 3 }),
      input('b', '3.551.900', { deliverySourceGroupKey: 'D-1', deliverySourceGroupSize: 3 }),
      input('c', '3.551.500', { deliverySourceGroupKey: 'D-2' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['a', 'b']);
    expect(groups[0]?.signal).toBe('source');
    expect(groups[0]?.confidence).toBe('confirmed');
  });

  it('exposes expectedSize (N) and presentSize for „X von N" completeness', () => {
    const groups = detectDeliveryGroups([
      input('a', '1', { deliverySourceGroupKey: 'D', deliverySourceGroupSize: 4 }),
      input('b', '2', { deliverySourceGroupKey: 'D', deliverySourceGroupSize: 4 }),
      input('c', '3', { deliverySourceGroupKey: 'D', deliverySourceGroupSize: 4 }),
    ]);
    expect(groups[0]?.expectedSize).toBe(4);
    expect(groups[0]?.presentSize).toBe(3); // 1 Beleg fehlt noch
  });

  it('T2 note: groups Belege that share the same deliveryNoteNo (likely)', () => {
    const groups = detectDeliveryGroups([
      input('a', '3.551.001', { deliveryNoteNo: 'LS-77' }),
      input('b', '3.551.900', { deliveryNoteNo: 'LS-77' }),
      input('c', '3.551.500', { deliveryNoteNo: 'LS-99' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['a', 'b']);
    expect(groups[0]?.signal).toBe('note');
    expect(groups[0]?.confidence).toBe('likely');
  });

  it('T3 run: groups a consecutive weBelegNo run as suspected', () => {
    const groups = detectDeliveryGroups([
      input('w1', '3.551.119'),
      input('w2', '3.551.120'),
      input('w3', '3.551.121'),
      input('w4', '3.551.122'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(groups[0]?.id).toBe('dg-3551119');
    expect(groups[0]?.signal).toBe('run');
    expect(groups[0]?.confidence).toBe('suspected');
  });

  it('hardens T3: a run does NOT link across different booking days', () => {
    const groups = detectDeliveryGroups(
      [
        input('a', '119', { bookingDate: '2026-06-15' }),
        input('b', '120', { bookingDate: '2026-06-16' }),
      ],
      cfg({ runRequiresSameDay: true }),
    );
    expect(groups).toHaveLength(0);
  });

  it('hardens T3: a run does NOT link across different Bereiche/sections', () => {
    const groups = detectDeliveryGroups(
      [input('a', '119', { section: 1 }), input('b', '120', { section: 2 })],
      cfg({ runRequiresSameSection: true }),
    );
    expect(groups).toHaveLength(0);
  });

  it('does NOT group when the weBelegNo gap exceeds the threshold', () => {
    const groups = detectDeliveryGroups(
      [input('x', '3.551.119'), input('y', '3.551.121')],
      cfg({ maxWeBelegGap: 1 }),
    );
    expect(groups).toHaveLength(0);
  });

  it('treats a single Beleg as no group', () => {
    expect(detectDeliveryGroups([input('solo', '500')])).toEqual([]);
  });

  it('returns nothing when disabled', () => {
    expect(detectDeliveryGroups([input('a', '1'), input('b', '2')], cfg({ enabled: false }))).toEqual(
      [],
    );
  });

  it('respects per-signal toggles (run off ⇒ no run group)', () => {
    const groups = detectDeliveryGroups(
      [input('a', '10'), input('b', '11')],
      cfg({ useBelegRun: false }),
    );
    expect(groups).toEqual([]);
  });

  it('merges note and run signals into one mixed component (highest tier wins)', () => {
    // a–b linked by a run; b–c linked by a shared note ⇒ one group {a,b,c}, note dominates.
    const groups = detectDeliveryGroups([
      input('a', '700'),
      input('b', '701', { deliveryNoteNo: 'LS-5' }),
      input('c', '999', { deliveryNoteNo: 'LS-5' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['a', 'b', 'c']);
    expect(groups[0]?.signal).toBe('mixed');
    expect(groups[0]?.confidence).toBe('likely');
  });

  it('is deterministic across runs and input order', () => {
    const a = detectDeliveryGroups([input('w2', '120'), input('w1', '119'), input('w3', '121')]);
    const b = detectDeliveryGroups([input('w1', '119'), input('w3', '121'), input('w2', '120')]);
    expect(a).toEqual(b);
    expect(a[0]?.caseIds).toEqual(['w1', 'w2', 'w3']);
  });

  it('uses the default config when none is supplied', () => {
    const groups = detectDeliveryGroups([input('a', '10'), input('b', '11')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.confidence).toBe('suspected');
  });
});

describe('detectDeliveryGroups — manual Teamlead override (locked)', () => {
  it('merges Belege sharing a `grp:` key as a locked group, frozen against auto signals', () => {
    const groups = detectDeliveryGroups([
      input('a', '500', { manualDeliveryGroupKey: 'grp:X' }),
      input('b', '999', { manualDeliveryGroupKey: 'grp:X' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('dg-m-X');
    expect(groups[0]?.signal).toBe('manual');
    expect(groups[0]?.confidence).toBe('locked');
    expect(groups[0]?.locked).toBe(true);
  });

  it('a `solo:` case is isolated and never auto-grouped with a consecutive neighbour', () => {
    const groups = detectDeliveryGroups([
      input('a', '119', { manualDeliveryGroupKey: 'solo:a' }),
      input('b', '120'),
      input('c', '121'),
    ]);
    // a is frozen out; b+c still form a run.
    expect(groups).toHaveLength(1);
    expect(groups[0]?.caseIds).toEqual(['b', 'c']);
  });
});

describe('withheldCaseIds — suspected groups wait for confirmation', () => {
  it('withholds suspected (T3) groups when autoDistributeSuspected is off', () => {
    const groups = detectDeliveryGroups([input('a', '119'), input('b', '120')]);
    const withheld = withheldCaseIds(groups, cfg({ autoDistributeSuspected: false }));
    expect([...withheld].sort()).toEqual(['a', 'b']);
  });

  it('does NOT withhold confirmed/likely groups', () => {
    const groups = detectDeliveryGroups([
      input('a', '1', { deliveryNoteNo: 'LS' }),
      input('b', '900', { deliveryNoteNo: 'LS' }),
    ]);
    expect(withheldCaseIds(groups, cfg({ autoDistributeSuspected: false })).size).toBe(0);
  });

  it('withholds nothing when autoDistributeSuspected is on', () => {
    const groups = detectDeliveryGroups([input('a', '119'), input('b', '120')]);
    expect(withheldCaseIds(groups, cfg({ autoDistributeSuspected: true })).size).toBe(0);
  });
});

describe('indexDeliveryGroups', () => {
  it('maps every member case to its group id and records the size + group', () => {
    const groups = detectDeliveryGroups([input('a', '119'), input('b', '120'), input('c', '121')]);
    const { groupIdByCaseId, sizeByGroupId, groupById } = indexDeliveryGroups(groups);
    expect(groupIdByCaseId.get('a')).toBe('dg-119');
    expect(groupIdByCaseId.get('b')).toBe('dg-119');
    expect(sizeByGroupId.get('dg-119')).toBe(3);
    expect(groupById.get('dg-119')?.confidence).toBe('suspected');
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
