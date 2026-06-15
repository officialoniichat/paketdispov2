import { describe, expect, it } from 'vitest';
import {
  employeeShiftSchema,
  goodsReceiptCaseSchema,
  type EmployeeShift,
  type GoodsReceiptCase,
  type PriorityFlag,
  type SectionCode,
} from '@paket/domain-types';
import { assignWork } from './plan.js';
import type { EngineInput } from '../types.js';

/**
 * Load test for the assignment engine (§17.2 "Lasttest für Batchimport von
 * 20-30 Lieferscheinen plus Tagesnachschub"; Anhang E.5 < 5 s recalc budget).
 * A batch of 30 delivery notes + 10 same-day replenishment cases across a full
 * shift must be planned deterministically well under the budget.
 */

const DATE = '2026-06-16';
const SECTIONS: (SectionCode | null)[] = [1, 2, 3, 4, 7, 8, null];

function makeCase(i: number, fromPreviousDay = false): GoodsReceiptCase {
  const flags: PriorityFlag[] = i % 9 === 0 ? ['prio'] : i % 7 === 0 ? ['catman_due'] : [];
  return goodsReceiptCaseSchema.parse({
    id: `case-${i}`,
    documentSetId: `ds-${i}`,
    weBelegNo: `WE-${100000 + i}`,
    bookingDate: fromPreviousDay ? '2026-06-15' : DATE,
    branchNo: '001',
    storageLocation: { id: `loc-${i % 12}`, type: 'regal', code: `R${i % 12}`, active: true },
    section: SECTIONS[i % SECTIONS.length] ?? null,
    priorityFlags: flags,
    totalQuantity: 20 + (i % 50),
    status: 'ready',
    effortPoints: 8 + (i % 25),
    estimatedMinutes: 15 + (i % 30),
    version: 0,
  });
}

function shift(n: number): EmployeeShift {
  return employeeShiftSchema.parse({
    id: `shift-E${n}`,
    employeeId: `E${n}`,
    date: DATE,
    plannedStart: `${DATE}T06:00:00+02:00`,
    plannedEnd: `${DATE}T14:30:00+02:00`,
    breakMinutes: 30,
    plannedHours: 8,
    netCapacityMinutes: 480,
    active: true,
  });
}

function buildInput(): EngineInput {
  // 30 fresh delivery notes + 10 same-day replenishment ("Tagesnachschub").
  const batch = Array.from({ length: 30 }, (_, i) => makeCase(i));
  const replenishment = Array.from({ length: 10 }, (_, i) => makeCase(100 + i, i % 2 === 0));
  return {
    date: DATE,
    cases: [...batch, ...replenishment],
    shifts: Array.from({ length: 6 }, (_, i) => shift(i + 1)),
    locations: Array.from({ length: 12 }, (_, i) => ({
      id: `loc-${i}`,
      code: `R${i}`,
      displayName: `Regal ${i}`,
      kind: 'regal' as const,
      sequenceIndex: i,
      active: true,
    })),
  };
}

describe('assignment engine — batch load (§17.2, Anhang E.5)', () => {
  it('plans 40 cases (30 + Tagesnachschub) in well under the 5 s budget', () => {
    const input = buildInput();

    const t0 = performance.now();
    const plan = assignWork(input);
    const durationMs = performance.now() - t0;

    expect(durationMs).toBeLessThan(5_000);

    const placed = plan.bundles.reduce((n, b) => n + b.caseIds.length, 0);
    // Every case is accounted for: either bundled or explicitly unassigned.
    expect(placed + plan.unassigned.length).toBe(input.cases.length);
    // With 6 × 480 min capacity vs ~40 small cases, the bulk gets placed.
    expect(placed).toBeGreaterThanOrEqual(30);
  });

  it('is deterministic: identical input yields an identical plan', () => {
    const a = assignWork(buildInput());
    const b = assignWork(buildInput());
    const shape = (p: ReturnType<typeof assignWork>) =>
      p.bundles
        .map((bundle) => `${bundle.employeeId}:${[...bundle.caseIds].sort().join(',')}`)
        .sort();
    expect(shape(a)).toEqual(shape(b));
  });
});
