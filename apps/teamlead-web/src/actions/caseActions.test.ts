import { describe, expect, it } from 'vitest';
import { caseActions, type CaseActionDescriptor } from './caseActions.js';

function ids(status: Parameters<typeof caseActions>[0]): CaseActionDescriptor['id'][] {
  return caseActions(status).map((a) => a.id);
}

describe('caseActions registry', () => {
  it('issue_open offers resolve_issue', () => {
    expect(ids('issue_open')).toContain('resolve_issue');
  });

  it('ready offers park, prioritise and cancel but not unpark', () => {
    const got = ids('ready');
    expect(got).toContain('park');
    expect(got).toContain('prioritise');
    expect(got).toContain('cancel');
    expect(got).not.toContain('unpark');
  });

  it('parked offers unpark, not park', () => {
    const got = ids('parked');
    expect(got).toContain('unpark');
    expect(got).not.toContain('park');
  });

  it('in_progress offers only prioritise', () => {
    expect(ids('in_progress')).toEqual(['prioritise']);
  });

  it('terminal statuses offer no actions', () => {
    expect(ids('completed')).toEqual([]);
    expect(ids('zst_done')).toEqual([]);
    expect(ids('cancelled')).toEqual([]);
  });

  it('sorts primary actions before secondary', () => {
    const got = caseActions('ready');
    const firstSecondary = got.findIndex((a) => !a.primary);
    const lastPrimary = got.map((a) => a.primary).lastIndexOf(true);
    if (firstSecondary !== -1) expect(lastPrimary).toBeLessThan(firstSecondary);
  });
});
