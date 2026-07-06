import { describe, expect, it } from 'vitest';
import {
  employeeShiftSchema,
  goodsReceiptCaseSchema,
  type EffortInputVector,
  type EmployeeShift,
  type GoodsReceiptCase,
  type Id,
  type LocationMaster,
} from '@paket/domain-types';
import { assignWork } from './plan.js';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../config.js';
import type { EngineInput } from '../types.js';

const DATE = '2026-06-16';
const NOW = '2026-06-16T05:30:00+02:00';

function makeCase(overrides: Partial<GoodsReceiptCase> & { id: string }): GoodsReceiptCase {
  return goodsReceiptCaseSchema.parse({
    source: 'prohandel_api',
    externalRef: `WE-${overrides.id}`,
    weBelegNo: `WE-${overrides.id}`,
    bookingDate: DATE,
    branchNo: '001',
    storageLocation: {
      id: `loc-${overrides.id}`,
      type: 'regal',
      code: `R${overrides.id}`,
      active: true,
    },
    section: null,
    priorityFlags: [],
    totalQuantity: 50,
    status: 'ready',
    effortPoints: 30,
    estimatedMinutes: 30,
    version: 0,
    ...overrides,
  });
}

function shift(employeeId: string, capacity: number, workstationId?: string): EmployeeShift {
  return employeeShiftSchema.parse({
    id: `shift-${employeeId}`,
    employeeId,
    date: DATE,
    plannedStart: '2026-06-16T06:00:00+02:00',
    plannedEnd: '2026-06-16T14:30:00+02:00',
    breakMinutes: 30,
    plannedHours: 8,
    netCapacityMinutes: capacity,
    workstationId,
    active: true,
  });
}

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    date: DATE,
    cases: [],
    shifts: [shift('E-1', 480), shift('E-2', 480)],
    locations: [],
    ...overrides,
  };
}

describe('assignWork (§8.3 end-to-end)', () => {
  it('excludes parked/cancelled cases and assigns the rest', () => {
    const input = baseInput({
      cases: [
        makeCase({ id: '1' }),
        makeCase({ id: '2', status: 'parked' }),
        makeCase({ id: '3', status: 'cancelled' }),
        makeCase({ id: '4' }),
      ],
    });
    const plan = assignWork(input, undefined, { now: NOW });
    const assignedIds = plan.bundles.flatMap((b) => b.caseIds).sort();
    expect(assignedIds).toEqual(['1', '4']);
    expect(
      plan.unassigned
        .filter((u) => u.reason === 'excluded')
        .map((u) => u.caseId)
        .sort(),
    ).toEqual(['2', '3']);
    expect(plan.diagnostics.excludedCaseCount).toBe(2);
  });

  it('uses the full capacity with nothing held back, in priority order', () => {
    // Tight single-employee capacity: exactly one 30-min case fits. The whole
    // capacity is usable and the scarce slot goes to the highest-priority case;
    // the normal one overflows purely for lack of capacity.
    const tight = baseInput({ shifts: [shift('E-1', 30)] });
    const plan = assignWork(
      {
        ...tight,
        cases: [makeCase({ id: 'n' }), makeCase({ id: 'p', priorityFlags: ['prio'] })],
      },
      undefined,
      { now: NOW },
    );
    expect(plan.bundles.flatMap((b) => b.caseIds)).toEqual(['p']);
    expect(plan.unassigned.map((u) => ({ id: u.caseId, reason: u.reason }))).toEqual([
      { id: 'n', reason: 'no_capacity' },
    ]);
  });

  it('withholds an incomplete Liefergruppe but assigns it after TL release (D2)', () => {
    // "2 von 3 da": incomplete source group is pool-held (delivery_unconfirmed) …
    const held = (released: boolean) =>
      baseInput({
        cases: [
          makeCase({
            id: 'g1',
            deliverySourceGroupKey: 'LS-77',
            deliverySourceGroupSize: 3,
            deliveryGroupReleased: released,
          }),
          makeCase({
            id: 'g2',
            deliverySourceGroupKey: 'LS-77',
            deliverySourceGroupSize: 3,
            deliveryGroupReleased: released,
          }),
        ],
      });
    const heldPlan = assignWork(held(false), undefined, { now: NOW });
    expect(heldPlan.bundles).toHaveLength(0);
    expect(heldPlan.unassigned.map((u) => u.reason)).toEqual([
      'delivery_unconfirmed',
      'delivery_unconfirmed',
    ]);
    // … and „trotzdem bearbeiten" (deliveryGroupReleased) lifts the hold.
    const releasedPlan = assignWork(held(true), undefined, { now: NOW });
    expect(releasedPlan.bundles.flatMap((b) => b.caseIds).sort()).toEqual(['g1', 'g2']);
  });

  it('forms starter packages from previous-day cases', () => {
    const input = baseInput({
      cases: [makeCase({ id: 'old', bookingDate: '2026-06-12' }), makeCase({ id: 'today1' })],
    });
    const plan = assignWork(input, undefined, { now: NOW });
    expect(plan.diagnostics.starterMinutes).toBeGreaterThan(0);
    expect(plan.bundles.flatMap((b) => b.caseIds)).toContain('old');
  });

  it('attaches a non-optimising pickup order inside each bundle (§D.3)', () => {
    const cases = [
      makeCase({
        id: 'a',
        storageLocation: { id: 'l-pb4', type: 'palette', code: 'B-4', active: true },
      }),
      makeCase({
        id: 'b',
        storageLocation: { id: 'l-r7', type: 'regal', code: 'R7', active: true },
      }),
    ];
    const input = baseInput({ shifts: [shift('E-1', 480, 'ws-1')], cases });
    const plan = assignWork(input, undefined, { now: NOW });
    expect(plan.pickupSequences).toHaveLength(plan.bundles.length);
    const bundle = plan.bundles[0]!;
    if (bundle.caseIds.length === 2) {
      // Regal before Palette regardless of input order.
      expect(bundle.route.map((s) => s.locationCode)).toEqual(['R7', 'B-4']);
    }
  });

  it('uses effort vectors when provided (Warengruppen signal)', () => {
    const vectors = new Map<Id, EffortInputVector>([
      [
        '1',
        {
          caseId: '1',
          totalQuantity: 100,
          wgrCodes: ['218110'],
          priceLabelPrintRequired: true,
          priceLabelAttachPositionCount: 0,
          securityRequiredPositionCount: 0,
          onlineRelevantPositionCount: 0,
          redPriceRequired: false,
          goodsReceiptCheckMode: 'quantity_only',
        },
      ],
    ]);
    const input = baseInput({ cases: [makeCase({ id: '1' })], effortVectors: vectors });
    const plan = assignWork(input, undefined, { now: NOW });
    // 3 + 100*0.35*1.15 + 2 = 45.25 (overrides the case's estimatedMinutes of 30)
    expect(plan.bundles[0]?.plannedEffortMinutes).toBeCloseTo(45.25, 2);
  });

  it('is deterministic across repeated runs (recalculate)', () => {
    const cases = Array.from({ length: 12 }, (_, i) =>
      makeCase({ id: String(i), estimatedMinutes: 20 + (i % 4) * 10, effortPoints: 20 }),
    );
    const input = baseInput({ cases });
    const a = assignWork(input, undefined, { now: NOW });
    const b = assignWork(input, undefined, { now: NOW });
    const fingerprint = (p: typeof a): string =>
      p.bundles.map((x) => `${x.id}:${x.employeeId}:${x.caseIds.join(',')}`).join('|');
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('emits at most one bundle per employee (one day plan per person)', () => {
    // 12 cases over 2 employees: without merging the engine would split each
    // person's work across several proto-bundles; the plan must collapse to ≤1.
    const cases = Array.from({ length: 12 }, (_, i) =>
      makeCase({ id: String(i), estimatedMinutes: 30, effortPoints: 30 }),
    );
    const plan = assignWork(baseInput({ cases }), undefined, { now: NOW });
    const byEmployee = new Map<string, number>();
    for (const b of plan.bundles) {
      byEmployee.set(b.employeeId, (byEmployee.get(b.employeeId) ?? 0) + 1);
    }
    for (const count of byEmployee.values()) {
      expect(count).toBe(1);
    }
    // Every assigned case still appears exactly once across the merged bundles.
    const assigned = plan.bundles.flatMap((b) => b.caseIds);
    expect(new Set(assigned).size).toBe(assigned.length);
    // A merged bundle carries cases and a recomputed pickup route.
    for (const b of plan.bundles) {
      expect(b.caseIds.length).toBeGreaterThan(0);
      expect(b.route.length).toBeGreaterThan(0);
    }
  });

  it('reports unassigned cases when there is no capacity', () => {
    const input = baseInput({ shifts: [], cases: [makeCase({ id: '1' })] });
    const plan = assignWork(input, undefined, { now: NOW });
    expect(plan.bundles).toHaveLength(0);
    expect(plan.unassigned.some((u) => u.caseId === '1' && u.reason === 'no_capacity')).toBe(true);
  });

  it('plans a realistic day pool in well under the Anhang E.5 5 s budget', () => {
    const cases: GoodsReceiptCase[] = [];
    const locations: LocationMaster[] = [];
    for (let i = 0; i < 800; i++) {
      const section = ([1, 2, 3, 4, 7, 8] as const)[i % 6];
      cases.push(
        makeCase({
          id: `c${i}`,
          bookingDate: i % 5 === 0 ? '2026-06-12' : DATE,
          section,
          loadPlanDate: DATE,
          priorityFlags: i % 11 === 0 ? ['prio'] : [],
          estimatedMinutes: 15 + (i % 7) * 8,
          effortPoints: 15 + (i % 7) * 8,
          storageLocation: { id: `loc-${i}`, type: 'regal', code: `R${i % 40}`, active: true },
        }),
      );
    }
    const shifts = Array.from({ length: 30 }, (_, i) => shift(`E-${i}`, 420 + (i % 3) * 30));
    const input: EngineInput = { date: DATE, cases, shifts, locations };

    const start = performance.now();
    const plan = assignWork(input, undefined, { now: NOW });
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(5000);
    expect(plan.bundles.length).toBeGreaterThan(0);
  });
});

describe('assignWork — Schichtende-Cutoff (ZIEL A, Punkt 5)', () => {
  // Shift window 06:00–14:30 (+02:00) = 510 min; cutoffPoint = 12:30 with a 120-min cutoff.
  const cutoff120: EngineConfig = {
    ...DEFAULT_ENGINE_CONFIG,
    shiftEnd: { autoCutoffMinutes: 120 },
  };

  function poolFillingCapacity(): GoodsReceiptCase[] {
    // 40 cases × 30 min = 1200 min of work — far more than two 480-min shifts can hold,
    // so the assigned total is bounded by (effective) capacity, not by the pool size.
    return Array.from({ length: 40 }, (_, i) => makeCase({ id: `cut-${i}` }));
  }

  it('assigns no new bundles once now is inside the cutoff window', () => {
    const input = baseInput({ cases: poolFillingCapacity() });
    // now 13:00 > cutoffPoint 12:30 → every shift is past its cutoff → effective 0.
    const plan = assignWork(input, cutoff120, { now: '2026-06-16T13:00:00+02:00' });
    expect(plan.bundles).toHaveLength(0);
    expect(plan.unassigned.every((u) => u.reason === 'no_capacity')).toBe(true);
  });

  it('reserves the cutoff window: effective capacity is strictly below the full capacity', () => {
    // Seit dem Teile-Modell verteilt der Batch ohnehin nur EIN Starter-Pack je
    // Mitarbeiter — der Cutoff wirkt daher auf das MACHBARKEITS-Budget (Minuten):
    // die Cutoff-effektive Gesamtkapazität liegt strikt unter der vollen Kapazität.
    const input = baseInput({ cases: poolFillingCapacity() });
    const capacity = (config: EngineConfig): number =>
      assignWork(input, config, { now: NOW }).diagnostics.totalCapacityMinutes;

    const withoutCutoff = capacity(DEFAULT_ENGINE_CONFIG); // autoCutoffMinutes 0 → full capacity
    const withCutoff = capacity(cutoff120);
    expect(withCutoff).toBeGreaterThan(0);
    expect(withCutoff).toBeLessThan(withoutCutoff);
  });
});
