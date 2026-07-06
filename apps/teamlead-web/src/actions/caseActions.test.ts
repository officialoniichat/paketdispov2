import { describe, expect, it } from 'vitest';
import type { CaseLike } from './caseActions.js';
import { getAvailableActions, type CaseActionDescriptor } from './caseActions.js';

function ids(c: CaseLike): CaseActionDescriptor['id'][] {
  return getAvailableActions(c).map((a) => a.id);
}

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
    const got = ids({ status: 'ready', priorityFlags: ['manual_teamlead_priority'] });
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

  it('assigned offers cancel + forward/attention (status-neutral), no pool actions', () => {
    const got = ids({ status: 'assigned', priorityFlags: [] });
    expect(got).toContain('cancel');
    expect(got).toContain('forward');
    expect(got).toContain('attention');
    expect(got).not.toContain('prioritise');
    expect(got).not.toContain('assign');
  });

  it('in_progress offers cancel + forward/attention', () => {
    const got = ids({ status: 'in_progress', priorityFlags: [] });
    expect(got).toContain('cancel');
    expect(got).toContain('forward');
    expect(got).toContain('attention');
  });

  it('issue_open offers resolve_issue and cancel, not prioritise', () => {
    const got = ids({ status: 'issue_open', priorityFlags: [] });
    expect(got).toContain('resolve_issue');
    expect(got).toContain('cancel');
    expect(got).not.toContain('prioritise');
  });

  it('partially_completed offers reactivate + forward/attention', () => {
    const got = ids({ status: 'partially_completed', priorityFlags: [] });
    expect(got).toContain('reactivate');
    expect(got).toContain('forward');
    expect(got).toContain('attention');
  });

  it('terminal statuses offer no actions at all (incl. no forward/attention)', () => {
    expect(ids({ status: 'completed', priorityFlags: [] })).toEqual([]);
    expect(ids({ status: 'zst_done', priorityFlags: [] })).toEqual([]);
    expect(ids({ status: 'cancelled', priorityFlags: [] })).toEqual([]);
  });

  it('ready + unassigned offers assign; ready + assigned does not', () => {
    expect(ids({ status: 'ready', priorityFlags: [], assignedTo: null })).toContain('assign');
    expect(ids({ status: 'ready', priorityFlags: [] })).toContain('assign');
    expect(ids({ status: 'ready', priorityFlags: [], assignedTo: 'emp-1' })).not.toContain('assign');
  });

  it('assign is never offered outside ready', () => {
    expect(ids({ status: 'parked', priorityFlags: [], assignedTo: null })).not.toContain('assign');
    expect(ids({ status: 'assigned', priorityFlags: [], assignedTo: null })).not.toContain('assign');
  });

  it('forwardedTo null offers forward, not unforward; non-null the reverse', () => {
    const notForwarded = ids({ status: 'ready', priorityFlags: [], forwardedTo: null });
    expect(notForwarded).toContain('forward');
    expect(notForwarded).not.toContain('unforward');

    const forwarded = ids({ status: 'ready', priorityFlags: [], forwardedTo: 'lieferscheinbucher' });
    expect(forwarded).toContain('unforward');
    expect(forwarded).not.toContain('forward');
  });

  it('attentionFlag false offers attention, not unattention; true the reverse', () => {
    const unflagged = ids({ status: 'ready', priorityFlags: [], attentionFlag: false });
    expect(unflagged).toContain('attention');
    expect(unflagged).not.toContain('unattention');

    const flagged = ids({ status: 'ready', priorityFlags: [], attentionFlag: true });
    expect(flagged).toContain('unattention');
    expect(flagged).not.toContain('attention');
  });

  it('sorts primary actions before secondary', () => {
    const got = getAvailableActions({ status: 'needs_review', priorityFlags: [] });
    const firstSecondary = got.findIndex((a) => !a.primary);
    const lastPrimary = got.map((a) => a.primary).lastIndexOf(true);
    if (firstSecondary !== -1) expect(lastPrimary).toBeLessThan(firstSecondary);
  });
});
