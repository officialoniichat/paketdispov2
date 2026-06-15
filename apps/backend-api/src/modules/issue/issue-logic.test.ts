import { describe, expect, it } from 'vitest';
import type { WorkIssue } from '@paket/domain-types';
import {
  canTransitionIssue,
  computeBlockingEffect,
  isBlocking,
  openIssue,
  rejectIssue,
  releaseIssue,
  resolveIssue,
  teamleadInbox,
  type OpenIssueInput,
} from './issue-logic.js';

const NOW = '2026-06-15T08:00:00.000Z';
const EMPLOYEE = { type: 'employee', id: 'emp-1' } as const;
const TEAMLEAD = { type: 'teamlead', id: 'tl-1' } as const;

function input(overrides: Partial<OpenIssueInput> = {}): OpenIssueInput {
  return {
    caseId: 'case-1',
    scope: 'position',
    scopeId: 'pos-1',
    employeeId: 'emp-1',
    issueType: 'missing_quantity',
    ...overrides,
  };
}

describe('openIssue – scope-level blocking (§4.5)', () => {
  it('blocks only the position, leaving the case workable (Restware weiter)', () => {
    const decision = openIssue(
      input({ scope: 'position', scopeId: 'pos-7' }),
      'iss-1',
      NOW,
      EMPLOYEE,
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.effect.blocksWholeCase).toBe(false);
    expect(decision.effect.blockedEntityId).toBe('pos-7');
    expect(decision.caseStatus).toBeUndefined();
  });

  it('blocks the whole case and moves it to issue_open for scope=case', () => {
    const decision = openIssue(
      input({ scope: 'case', scopeId: undefined }),
      'iss-2',
      NOW,
      EMPLOYEE,
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.effect.blocksWholeCase).toBe(true);
    expect(decision.caseStatus).toBe('issue_open');
    expect(decision.issue.scopeId).toBeUndefined();
  });

  it.each(['position', 'sku_line', 'transport_box'] as const)(
    'requires scopeId for scope=%s',
    (scope) => {
      const decision = openIssue(input({ scope, scopeId: undefined }), 'iss-3', NOW, EMPLOYEE);
      expect(decision.ok).toBe(false);
    },
  );

  it('emits an issue.created event', () => {
    const decision = openIssue(input(), 'iss-4', NOW, EMPLOYEE);
    if (!decision.ok) throw new Error('expected ok');
    expect(decision.events).toHaveLength(1);
    expect(decision.events[0].eventType).toBe('issue.created');
    expect(decision.events[0].entityId).toBe('iss-4');
  });
});

describe('issue status transitions', () => {
  it('allows open → resolved/rejected/in_review but not resolved → open', () => {
    expect(canTransitionIssue('open', 'resolved')).toBe(true);
    expect(canTransitionIssue('open', 'rejected')).toBe(true);
    expect(canTransitionIssue('open', 'in_review')).toBe(true);
    expect(canTransitionIssue('resolved', 'open')).toBe(false);
  });

  it('marks open/in_review issues as blocking', () => {
    const base: WorkIssue = {
      id: 'i',
      caseId: 'c',
      scope: 'position',
      scopeId: 'p',
      employeeId: 'e',
      issueType: 'damaged_goods',
      reportedAt: NOW,
      status: 'open',
    };
    expect(isBlocking(base)).toBe(true);
    expect(isBlocking({ ...base, status: 'resolved' })).toBe(false);
  });
});

describe('teamlead resolve / release / reject', () => {
  const caseIssue: WorkIssue = {
    id: 'iss-c',
    caseId: 'case-1',
    scope: 'case',
    employeeId: 'emp-1',
    issueType: 'security_problem',
    reportedAt: NOW,
    status: 'open',
  };

  it('resolve routes a case-scoped issue to released', () => {
    const d = resolveIssue(caseIssue, 'corrected in Prohandel', NOW, TEAMLEAD);
    if (!d.ok) throw new Error('expected ok');
    expect(d.issue.status).toBe('resolved');
    expect(d.issue.resolution).toBe('corrected in Prohandel');
    expect(d.caseStatus).toBe('released');
    expect(d.events[0].eventType).toBe('issue.resolved');
  });

  it('release stamps releasedBy/releasedAt and unblocks the case', () => {
    const d = releaseIssue(caseIssue, NOW, TEAMLEAD);
    if (!d.ok) throw new Error('expected ok');
    expect(d.issue.releasedBy).toBe('tl-1');
    expect(d.issue.releasedAt).toBe(NOW);
    expect(d.caseStatus).toBe('released');
  });

  it('reject is terminal and never proposes a blocking case status for scoped issues', () => {
    const scoped: WorkIssue = { ...caseIssue, scope: 'position', scopeId: 'pos-1' };
    const d = rejectIssue(scoped, 'no real deviation', NOW, TEAMLEAD);
    if (!d.ok) throw new Error('expected ok');
    expect(d.issue.status).toBe('rejected');
    expect(d.caseStatus).toBeUndefined();
  });

  it('cannot resolve an already-resolved issue', () => {
    const resolved: WorkIssue = { ...caseIssue, status: 'resolved' };
    expect(resolveIssue(resolved, 'x', NOW, TEAMLEAD).ok).toBe(false);
  });
});

describe('teamleadInbox', () => {
  it('returns actionable issues oldest-first and hides closed ones', () => {
    const mk = (id: string, status: WorkIssue['status'], at: string): WorkIssue => ({
      id,
      caseId: 'c',
      scope: 'case',
      employeeId: 'e',
      issueType: 'other',
      reportedAt: at,
      status,
    });
    const inbox = teamleadInbox([
      mk('a', 'open', '2026-06-15T09:00:00.000Z'),
      mk('b', 'resolved', '2026-06-15T07:00:00.000Z'),
      mk('c', 'in_review', '2026-06-15T08:00:00.000Z'),
      mk('d', 'rejected', '2026-06-15T06:00:00.000Z'),
    ]);
    expect(inbox.map((i) => i.id)).toEqual(['c', 'a']);
  });
});

describe('computeBlockingEffect', () => {
  it('drops scopeId for case scope', () => {
    expect(
      computeBlockingEffect({ caseId: 'c', scope: 'case', scopeId: 'x' }).blockedEntityId,
    ).toBeUndefined();
  });
});
