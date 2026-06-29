import { describe, expect, it } from 'vitest';
import { employeeShiftSchema, type EmployeeShift } from '@paket/domain-types';
import {
  autoAssignableCapacityMinutes,
  finishableBudgetMinutes,
  minutesUntilShiftEnd,
} from './shift-end.js';

/** An 8-hour shift 06:00–14:00 UTC with 480 net minutes (window === net for clean math). */
function shift(overrides: Partial<EmployeeShift> = {}): EmployeeShift {
  return employeeShiftSchema.parse({
    id: 'shift-E-1',
    employeeId: 'E-1',
    date: '2026-06-16',
    plannedStart: '2026-06-16T06:00:00.000Z',
    plannedEnd: '2026-06-16T14:00:00.000Z',
    breakMinutes: 0,
    plannedHours: 8,
    netCapacityMinutes: 480,
    active: true,
    ...overrides,
  });
}

describe('minutesUntilShiftEnd', () => {
  it('returns the wall-clock minutes left before plannedEnd', () => {
    expect(minutesUntilShiftEnd(shift(), '2026-06-16T13:00:00.000Z')).toBe(60);
    expect(minutesUntilShiftEnd(shift(), '2026-06-16T06:00:00.000Z')).toBe(480);
  });

  it('clamps to 0 once the shift is over or the input is unparseable', () => {
    expect(minutesUntilShiftEnd(shift(), '2026-06-16T15:00:00.000Z')).toBe(0);
    expect(minutesUntilShiftEnd(shift(), 'not-a-date')).toBe(0);
  });
});

describe('autoAssignableCapacityMinutes (ZIEL A — auto cutoff)', () => {
  it('is a no-op when autoCutoffMinutes is 0 (engine default), regardless of now', () => {
    expect(autoAssignableCapacityMinutes(shift(), '2026-06-16T13:55:00.000Z')).toBe(480);
    expect(
      autoAssignableCapacityMinutes(shift(), '2026-06-16T13:55:00.000Z', { autoCutoffMinutes: 0 }),
    ).toBe(480);
  });

  it('reserves the last 2h when planning at shift start (cutoff 120 → 75% of an 8h shift)', () => {
    // cutoffPoint = 12:00; assignable window 06:00→12:00 = 360 min; 360/480 = 0.75.
    expect(
      autoAssignableCapacityMinutes(shift(), '2026-06-16T06:00:00.000Z', { autoCutoffMinutes: 120 }),
    ).toBe(360);
  });

  it('shrinks the assignable capacity as now advances toward the cutoff point', () => {
    // now 10:00 → assignable window 10:00→12:00 = 120 min; 120/480 = 0.25 → 120.
    expect(
      autoAssignableCapacityMinutes(shift(), '2026-06-16T10:00:00.000Z', { autoCutoffMinutes: 120 }),
    ).toBe(120);
  });

  it('returns 0 once now is at/after the cutoff point (no auto-assignment in the tail)', () => {
    expect(
      autoAssignableCapacityMinutes(shift(), '2026-06-16T12:00:00.000Z', { autoCutoffMinutes: 120 }),
    ).toBe(0);
    expect(
      autoAssignableCapacityMinutes(shift(), '2026-06-16T13:30:00.000Z', { autoCutoffMinutes: 120 }),
    ).toBe(0);
  });

  it('returns 0 for an inactive or zero-capacity shift', () => {
    expect(
      autoAssignableCapacityMinutes(shift({ active: false }), '2026-06-16T06:00:00.000Z', {
        autoCutoffMinutes: 120,
      }),
    ).toBe(0);
    expect(
      autoAssignableCapacityMinutes(shift({ netCapacityMinutes: 0 }), '2026-06-16T06:00:00.000Z', {
        autoCutoffMinutes: 120,
      }),
    ).toBe(0);
  });
});

describe('finishableBudgetMinutes (ZIEL B — finishable pull)', () => {
  it('caps the pull budget at the wall-clock time left until shift end', () => {
    // 60 min left, ample remaining capacity → 60.
    expect(finishableBudgetMinutes(300, shift(), '2026-06-16T13:00:00.000Z')).toBe(60);
  });

  it('caps at remaining capacity when that is the tighter bound', () => {
    expect(finishableBudgetMinutes(40, shift(), '2026-06-16T08:00:00.000Z')).toBe(40);
  });

  it('is 0 once the shift is over (no unfinishable work handed out)', () => {
    expect(finishableBudgetMinutes(300, shift(), '2026-06-16T14:30:00.000Z')).toBe(0);
  });
});
