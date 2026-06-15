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

  it('walks the main happy path', () => {
    const path: CaseStatus[] = [
      'imported',
      'parsed',
      'ready',
      'assigned',
      'picking',
      'preparing',
      'sorting',
      'checking',
      'boxing',
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

  it('allows the needs_review Sonderpfad', () => {
    expect(canTransition('parsed', 'needs_review')).toBe(true);
    expect(canTransition('needs_review', 'ready')).toBe(true);
  });

  it('allows the issue Sonderpfad issue_open → waiting_teamlead → released → checking', () => {
    expect(canTransition('checking', 'issue_open')).toBe(true);
    expect(canTransition('issue_open', 'waiting_teamlead')).toBe(true);
    expect(canTransition('waiting_teamlead', 'released')).toBe(true);
    expect(canTransition('released', 'checking')).toBe(true);
  });

  it('allows the partially_completed Sonderpfad (ready_next_day) and direct completion', () => {
    expect(canTransition('boxing', 'partially_completed')).toBe(true);
    expect(canTransition('partially_completed', 'ready')).toBe(true);
    expect(canTransition('partially_completed', 'completed')).toBe(true);
  });

  it('allows the teamlead unassign override assigned → ready', () => {
    expect(canTransition('assigned', 'ready')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('imported', 'completed')).toBe(false);
    expect(canTransition('ready', 'zst_done')).toBe(false);
    expect(canTransition('completed', 'picking')).toBe(false);
  });

  it('assertTransition throws InvalidCaseTransitionError on an illegal edge', () => {
    expect(() => assertTransition('imported', 'completed')).toThrowError(
      InvalidCaseTransitionError,
    );
    expect(() => assertTransition('parsed', 'ready')).not.toThrow();
  });

  it('treats zst_done and cancelled as terminal (no outgoing edges)', () => {
    expect(isTerminal('zst_done')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(nextStatuses('zst_done')).toHaveLength(0);
    expect(nextStatuses('cancelled')).toHaveLength(0);
  });

  it('lets nearly every non-terminal status be cancelled', () => {
    expect(canTransition('ready', 'cancelled')).toBe(true);
    expect(canTransition('checking', 'cancelled')).toBe(true);
  });
});
