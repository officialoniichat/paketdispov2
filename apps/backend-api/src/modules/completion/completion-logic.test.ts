import { describe, expect, it } from 'vitest';
import {
  canFullyComplete,
  carryOverToNextDay,
  completeCase,
  partialComplete,
  processingMinutes,
  proratedEffort,
  type CompletionInput,
} from './completion-logic.js';

const START = '2026-06-15T08:00:00.000Z';
const NOW = '2026-06-15T09:30:00.000Z';
const EMPLOYEE = { type: 'employee', id: 'emp-1' } as const;

function input(overrides: Partial<CompletionInput> = {}): CompletionInput {
  return {
    caseId: 'case-1',
    employeeId: 'emp-1',
    totalQuantity: 100,
    confirmedQuantity: 100,
    effortPoints: 40,
    openIssueCount: 0,
    unsealedBoxCount: 0,
    startedAt: START,
    source: 'mobile_app',
    ...overrides,
  };
}

describe('processingMinutes', () => {
  it('returns whole minutes between timestamps', () => {
    expect(processingMinutes(START, NOW)).toBe(90);
  });
  it('returns 0 without a start time or for negative spans', () => {
    expect(processingMinutes(undefined, NOW)).toBe(0);
    expect(processingMinutes(NOW, START)).toBe(0);
  });
});

describe('proratedEffort', () => {
  it('scales effort by completed/total', () => {
    expect(proratedEffort(100, 25, 40)).toBe(10);
  });
  it('is 0 for zero total or completed', () => {
    expect(proratedEffort(0, 10, 40)).toBe(0);
    expect(proratedEffort(100, 0, 40)).toBe(0);
  });
});

describe('completeCase (§15.1)', () => {
  it('creates a full ZST and moves the case to completed', () => {
    const d = completeCase(input(), 'zst-1', NOW, EMPLOYEE);
    if (!d.ok) throw new Error('expected ok');
    expect(d.caseStatus).toBe('completed');
    expect(d.zst.completedQuantity).toBe(100);
    expect(d.zst.effortPoints).toBe(40);
    expect(d.remainingQuantity).toBe(0);
    expect(d.events.map((e) => e.eventType)).toEqual(['case.completed', 'zst.created']);
  });

  it('refuses to complete with open issues', () => {
    expect(completeCase(input({ openIssueCount: 1 }), 'zst-1', NOW, EMPLOYEE).ok).toBe(false);
  });

  it('refuses to complete with unsealed boxes', () => {
    expect(completeCase(input({ unsealedBoxCount: 2 }), 'zst-1', NOW, EMPLOYEE).ok).toBe(false);
  });

  it('refuses to complete when quantity is below total', () => {
    expect(completeCase(input({ confirmedQuantity: 80 }), 'zst-1', NOW, EMPLOYEE).ok).toBe(false);
  });

  it('canFullyComplete mirrors the guard', () => {
    expect(canFullyComplete(input())).toBe(true);
    expect(canFullyComplete(input({ confirmedQuantity: 50 }))).toBe(false);
  });
});

describe('partialComplete (§4.6 Teilabschluss)', () => {
  it('books the finished part with proportional effort and sets partially_completed', () => {
    const d = partialComplete(input({ confirmedQuantity: 60 }), 'zst-2', NOW, EMPLOYEE);
    if (!d.ok) throw new Error('expected ok');
    expect(d.caseStatus).toBe('partially_completed');
    expect(d.zst.completedQuantity).toBe(60);
    expect(d.zst.effortPoints).toBe(24); // 40 * 60/100
    expect(d.remainingQuantity).toBe(40);
    expect(d.events.map((e) => e.eventType)).toEqual(['case.partially_completed', 'zst.created']);
    expect(d.events[1].payload).toMatchObject({ partial: true });
  });

  it('rejects partial completion with nothing confirmed', () => {
    expect(partialComplete(input({ confirmedQuantity: 0 }), 'zst-2', NOW, EMPLOYEE).ok).toBe(false);
  });

  it('rejects partial completion when nothing remains', () => {
    expect(partialComplete(input({ confirmedQuantity: 100 }), 'zst-2', NOW, EMPLOYEE).ok).toBe(
      false,
    );
  });
});

describe('carryOverToNextDay', () => {
  it('re-readies a partially completed case for the next day', () => {
    const d = carryOverToNextDay('case-1', 'partially_completed', EMPLOYEE);
    if (!d.ok) throw new Error('expected ok');
    expect(d.caseStatus).toBe('ready');
    expect(d.events[0].eventType).toBe('case.ready');
  });

  it('rejects carry-over from a non-partial status', () => {
    expect(carryOverToNextDay('case-1', 'completed', EMPLOYEE).ok).toBe(false);
  });
});
