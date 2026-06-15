import type {
  CaseStatus,
  FileRef,
  Id,
  ISODateTime,
  IssueScope,
  IssueStatus,
  IssueType,
  WorkIssue,
} from '@paket/domain-types';
import { type Actor, eventDraft, type WorkflowEventDraft } from '../events.js';

/**
 * Issue management (§4.5 Flow: Problemfall). A reported deviation blocks **only the
 * affected level** – SKU line, position, transport box or the whole case – so the
 * rest of the goods keep flowing ("Restware weiter"). The teamlead inbox drives
 * resolve / release back into the picking flow.
 */

/** What a still-open issue blocks. Sibling work continues unless the whole case is blocked. */
export interface BlockingEffect {
  caseId: Id;
  scope: IssueScope;
  /** Position / SKU-line / box id; undefined for a case-wide block. */
  blockedEntityId?: Id;
  /** True only for scope === 'case'. Position/sku/box blocks leave the case workable. */
  blocksWholeCase: boolean;
}

export interface OpenIssueInput {
  caseId: Id;
  scope: IssueScope;
  scopeId?: Id;
  employeeId: Id;
  issueType: IssueType;
  description?: string;
  photoRefs?: FileRef[];
}

export type IssueDecision =
  | {
      ok: true;
      issue: WorkIssue;
      effect: BlockingEffect;
      events: WorkflowEventDraft[];
      /** Set only when the case-level status must change. */
      caseStatus?: CaseStatus;
    }
  | { ok: false; error: string };

const ENTITY_TYPE = 'issue';

/** Allowed issue status transitions (open → review/waiting → resolved/rejected). */
const ISSUE_TRANSITIONS: Readonly<Record<IssueStatus, readonly IssueStatus[]>> = {
  open: ['in_review', 'waiting_external', 'resolved', 'rejected'],
  in_review: ['waiting_external', 'resolved', 'rejected'],
  waiting_external: ['in_review', 'resolved', 'rejected'],
  resolved: [],
  rejected: [],
};

export function canTransitionIssue(from: IssueStatus, to: IssueStatus): boolean {
  return ISSUE_TRANSITIONS[from].includes(to);
}

/** Open issues that still demand teamlead attention block their level. */
export function isBlocking(issue: WorkIssue): boolean {
  return issue.status === 'open' || issue.status === 'in_review';
}

export function computeBlockingEffect(
  issue: Pick<WorkIssue, 'caseId' | 'scope' | 'scopeId'>,
): BlockingEffect {
  const blocksWholeCase = issue.scope === 'case';
  return {
    caseId: issue.caseId,
    scope: issue.scope,
    blockedEntityId: blocksWholeCase ? undefined : issue.scopeId,
    blocksWholeCase,
  };
}

/**
 * Decide the effect of a newly reported problem. A scoped (position/sku/box) issue
 * leaves the case status untouched so remaining work continues; a case-scoped issue
 * moves the case into `issue_open` (§7.1 checking → issue_open → waiting_teamlead).
 */
export function openIssue(
  input: OpenIssueInput,
  id: Id,
  now: ISODateTime,
  actor: Actor,
): IssueDecision {
  if (input.scope !== 'case' && !input.scopeId) {
    return { ok: false, error: `scopeId is required for scope "${input.scope}"` };
  }

  const issue: WorkIssue = {
    id,
    caseId: input.caseId,
    scope: input.scope,
    scopeId: input.scope === 'case' ? undefined : input.scopeId,
    employeeId: input.employeeId,
    issueType: input.issueType,
    description: input.description,
    photoRefs: input.photoRefs,
    reportedAt: now,
    status: 'open',
  };

  const effect = computeBlockingEffect(issue);
  const events: WorkflowEventDraft[] = [
    eventDraft('issue.created', ENTITY_TYPE, id, actor, {
      caseId: issue.caseId,
      scope: issue.scope,
      scopeId: issue.scopeId,
      issueType: issue.issueType,
    }),
  ];

  return {
    ok: true,
    issue,
    effect,
    events,
    caseStatus: effect.blocksWholeCase ? 'issue_open' : undefined,
  };
}

/**
 * Teamlead resolves the issue (problem clarified / corrected). Marks the issue
 * resolved and unblocks its level. A resolved case-scoped issue routes the case to
 * `released` so the worker can continue (§4.5 Freigabe / Ersatzanweisung).
 */
export function resolveIssue(
  issue: WorkIssue,
  resolution: string,
  now: ISODateTime,
  actor: Actor,
): IssueDecision {
  if (!canTransitionIssue(issue.status, 'resolved')) {
    return { ok: false, error: `cannot resolve issue in status "${issue.status}"` };
  }
  const resolved: WorkIssue = { ...issue, status: 'resolved', resolution };
  return {
    ok: true,
    issue: resolved,
    effect: { ...computeBlockingEffect(resolved), blocksWholeCase: false },
    events: [
      eventDraft('issue.resolved', ENTITY_TYPE, issue.id, actor, {
        caseId: issue.caseId,
        scope: issue.scope,
        outcome: 'resolved',
      }),
    ],
    caseStatus: issue.scope === 'case' ? 'released' : undefined,
  };
}

/**
 * Teamlead releases the block without a formal resolution (continue and clarify
 * later). Stamps releasedBy/releasedAt and lifts the case-level block.
 */
export function releaseIssue(issue: WorkIssue, now: ISODateTime, actor: Actor): IssueDecision {
  if (issue.status === 'rejected') {
    return { ok: false, error: 'cannot release a rejected issue' };
  }
  const released: WorkIssue = {
    ...issue,
    status: 'resolved',
    releasedBy: actor.id,
    releasedAt: now,
  };
  return {
    ok: true,
    issue: released,
    effect: { ...computeBlockingEffect(released), blocksWholeCase: false },
    events: [
      eventDraft('issue.resolved', ENTITY_TYPE, issue.id, actor, {
        caseId: issue.caseId,
        scope: issue.scope,
        outcome: 'released',
      }),
    ],
    caseStatus: issue.scope === 'case' ? 'released' : undefined,
  };
}

/** Teamlead rejects the report (no real problem). Terminal, never blocking. */
export function rejectIssue(
  issue: WorkIssue,
  reason: string,
  now: ISODateTime,
  actor: Actor,
): IssueDecision {
  if (!canTransitionIssue(issue.status, 'rejected')) {
    return { ok: false, error: `cannot reject issue in status "${issue.status}"` };
  }
  const rejected: WorkIssue = { ...issue, status: 'rejected', resolution: reason };
  return {
    ok: true,
    issue: rejected,
    effect: { ...computeBlockingEffect(rejected), blocksWholeCase: false },
    events: [
      eventDraft('issue.resolved', ENTITY_TYPE, issue.id, actor, {
        caseId: issue.caseId,
        outcome: 'rejected',
      }),
    ],
    caseStatus: issue.scope === 'case' ? 'released' : undefined,
  };
}

/** Teamlead inbox: still-actionable issues, oldest first (§4.5 Teamlead erhält Issue in Inbox). */
export function teamleadInbox(issues: readonly WorkIssue[]): WorkIssue[] {
  return issues
    .filter(
      (i) => i.status === 'open' || i.status === 'in_review' || i.status === 'waiting_external',
    )
    .slice()
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt));
}
