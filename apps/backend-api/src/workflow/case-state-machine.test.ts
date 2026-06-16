import { describe, expect, it } from 'vitest';
import { caseStatusSchema, type CaseStatus } from '@paket/domain-types';
import { CASE_TRANSITIONS, isTerminal } from './case-status.js';
import {
  assertTransition,
  canTransition,
  InvalidCaseTransitionError,
  nextStatuses,
} from './case-state-machine.js';

describe('case state machine (§7.1)', () => {
  it('defines transitions for every CaseStatus', () => {
    for (const status of caseStatusSchema.options) {
      expect(CASE_TRANSITIONS[status as CaseStatus]).toBeDefined();
    }
  });

  it('matches the expected transition graph (§7.1)', () => {
    const expected: Record<CaseStatus, CaseStatus[]> = {
      needs_review: ['ready', 'cancelled'],
      ready: ['assigned', 'parked', 'cancelled'],
      parked: ['ready', 'cancelled'],
      assigned: ['in_progress', 'ready', 'cancelled'],
      in_progress: ['issue_open', 'partially_completed', 'completed', 'cancelled'],
      issue_open: ['in_progress', 'cancelled'],
      partially_completed: ['ready'],
      completed: ['zst_done'],
      zst_done: [],
      cancelled: [],
    };
    for (const status of caseStatusSchema.options) {
      expect([...CASE_TRANSITIONS[status as CaseStatus]]).toEqual(expected[status as CaseStatus]);
    }
  });

  it('walks the main happy path', () => {
    const path: CaseStatus[] = [
      'needs_review',
      'ready',
      'assigned',
      'in_progress',
      'completed',
      'zst_done',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('allows the parking Sonderpfad ready ↔ parked', () => {
    expect(canTransition('ready', 'parked')).toBe(true);
    expect(canTransition('parked', 'ready')).toBe(true);
  });

  it('allows the issue Sonderpfad in_progress → issue_open → in_progress', () => {
    expect(canTransition('in_progress', 'issue_open')).toBe(true);
    expect(canTransition('issue_open', 'in_progress')).toBe(true);
  });

  it('allows the partially_completed Sonderpfad (ready_next_day)', () => {
    expect(canTransition('in_progress', 'partially_completed')).toBe(true);
    expect(canTransition('partially_completed', 'ready')).toBe(true);
    expect(canTransition('partially_completed', 'completed')).toBe(false);
  });

  it('allows the teamlead unassign override assigned → ready', () => {
    expect(canTransition('assigned', 'ready')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('needs_review', 'completed')).toBe(false);
    expect(canTransition('ready', 'zst_done')).toBe(false);
    expect(canTransition('completed', 'in_progress')).toBe(false);
  });

  it('assertTransition throws InvalidCaseTransitionError on an illegal edge', () => {
    expect(() => assertTransition('needs_review', 'completed')).toThrowError(
      InvalidCaseTransitionError,
    );
    expect(() => assertTransition('needs_review', 'ready')).not.toThrow();
  });

  it('treats zst_done and cancelled as terminal (no outgoing edges)', () => {
    expect(isTerminal('zst_done')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(nextStatuses('zst_done')).toHaveLength(0);
    expect(nextStatuses('cancelled')).toHaveLength(0);
  });

  it('lets nearly every non-terminal status be cancelled', () => {
    expect(canTransition('ready', 'cancelled')).toBe(true);
    expect(canTransition('in_progress', 'cancelled')).toBe(true);
  });
});
