import { describe, expect, it } from 'vitest';
import type { PriorityFlag } from '@paket/domain-types';
import { caseActions, type CaseActionDescriptor, type CaseLike } from './caseActions.js';

function ids(c: CaseLike): CaseActionDescriptor['id'][] {
  return caseActions(c).map((a) => a.id);
}

const PRIO: readonly PriorityFlag[] = ['manual_teamlead_priority'];

describe('caseActions registry', () => {
  it('needs_review offers approve, park, cancel and prioritise (no flags) but not deprioritise', () => {
    const got = ids({ status: 'needs_review', priorityFlags: [] });
    expect(got).toContain('approve');
    expect(got).toContain('park');
    expect(got).toContain('cancel');
    expect(got).toContain('prioritise');
    expect(got).not.toContain('deprioritise');
  });

  it('ready WITH manual priority offers deprioritise, not prioritise', () => {
    const got = ids({ status: 'ready', priorityFlags: PRIO });
    expect(got).toContain('deprioritise');
    expect(got).not.toContain('prioritise');
  });

  it('ready WITHOUT manual priority offers prioritise, not deprioritise', () => {
    const got = ids({ status: 'ready', priorityFlags: [] });
    expect(got).toContain('prioritise');
    expect(got).not.toContain('deprioritise');
  });

  it('parked offers unpark, not park', () => {
    const got = ids({ status: 'parked', priorityFlags: [] });
    expect(got).toContain('unpark');
    expect(got).not.toContain('park');
  });

  it('offers split (Aufteilen) on poolable states, not after assignment', () => {
    expect(ids({ status: 'ready', priorityFlags: [] })).toContain('split');
    expect(ids({ status: 'parked', priorityFlags: [] })).toContain('split');
    expect(ids({ status: 'assigned', priorityFlags: [] })).not.toContain('split');
    expect(ids({ status: 'needs_review', priorityFlags: [] })).not.toContain('split');
  });

  it('assigned offers only cancel (out of pool, no prioritise)', () => {
    expect(ids({ status: 'assigned', priorityFlags: [] })).toEqual(['cancel']);
  });

  it('in_progress offers only cancel', () => {
    expect(ids({ status: 'in_progress', priorityFlags: [] })).toEqual(['cancel']);
  });

  it('issue_open offers resolve_issue and cancel, not prioritise', () => {
    const got = ids({ status: 'issue_open', priorityFlags: [] });
    expect(got).toContain('resolve_issue');
    expect(got).toContain('cancel');
    expect(got).not.toContain('prioritise');
  });

  it('partially_completed offers only reactivate', () => {
    expect(ids({ status: 'partially_completed', priorityFlags: [] })).toEqual(['reactivate']);
  });

  it('terminal statuses offer no actions', () => {
    expect(ids({ status: 'completed', priorityFlags: [] })).toEqual([]);
    expect(ids({ status: 'zst_done', priorityFlags: [] })).toEqual([]);
    expect(ids({ status: 'cancelled', priorityFlags: [] })).toEqual([]);
  });

  it('sorts primary actions before secondary', () => {
    const got = caseActions({ status: 'needs_review', priorityFlags: [] });
    const firstSecondary = got.findIndex((a) => !a.primary);
    const lastPrimary = got.map((a) => a.primary).lastIndexOf(true);
    if (firstSecondary !== -1) expect(lastPrimary).toBeLessThan(firstSecondary);
  });
});
