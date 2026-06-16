import type { CaseStatus, Id, ISODateTime, ZstRecord } from '@paket/domain-types';
import { type Actor, eventDraft, type WorkflowEventDraft } from '../events.js';

/**
 * Case completion & partial completion (§4.6 Teilabschluss, §15.1 ZST-Zielbild).
 * Full completion emits a ZST record reproducing today's parts/IST-time figure and
 * additionally stores effort points + process time. A partial completion ships the
 * finished part, books its proportional ZST, and carries the remainder to the next
 * day with status `partially_completed` (§7.1 in_progress → partially_completed → ready).
 */

export interface CompletionInput {
  caseId: Id;
  employeeId: Id;
  /** Total planned quantity of the case (case.totalQuantity). */
  totalQuantity: number;
  /** Sum of confirmed SKU quantities so far. */
  confirmedQuantity: number;
  /** Full-case effort points (case.effortPoints). */
  effortPoints: number;
  /** Blocking issues still open on the case (§4.5). */
  openIssueCount: number;
  /** Boxes not yet sealed (§4.6 übrige Box bleibt offen). */
  unsealedBoxCount: number;
  startedAt?: ISODateTime;
  source: ZstRecord['source'];
}

export type CompletionDecision =
  | {
      ok: true;
      caseStatus: CaseStatus;
      zst: ZstRecord;
      remainingQuantity: number;
      events: WorkflowEventDraft[];
    }
  | { ok: false; error: string };

const CASE_ENTITY = 'goods_receipt_case';
const ZST_ENTITY = 'zst_record';

/** Processing duration in whole minutes between two ISO timestamps (≥ 0). */
export function processingMinutes(
  startedAt: ISODateTime | undefined,
  completedAt: ISODateTime,
): number {
  if (!startedAt) return 0;
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  return ms > 0 ? Math.round(ms / 60_000) : 0;
}

/** Effort points earned for a partially completed quantity (proportional, 2 decimals). */
export function proratedEffort(total: number, completed: number, effortPoints: number): number {
  if (total <= 0 || completed <= 0) return 0;
  const ratio = Math.min(completed / total, 1);
  return Math.round(effortPoints * ratio * 100) / 100;
}

/** A case is fully completable only when everything is confirmed, sealed and unblocked. */
export function canFullyComplete(input: CompletionInput): boolean {
  return (
    input.confirmedQuantity >= input.totalQuantity &&
    input.openIssueCount === 0 &&
    input.unsealedBoxCount === 0
  );
}

function buildZst(
  input: CompletionInput,
  completedQuantity: number,
  effortPoints: number,
  zstId: Id,
  now: ISODateTime,
): ZstRecord {
  return {
    id: zstId,
    caseId: input.caseId,
    employeeId: input.employeeId,
    completedQuantity,
    effortPoints,
    startedAt: input.startedAt,
    completedAt: now,
    source: input.source,
  };
}

/**
 * Full completion. Produces a ZST record for the whole confirmed quantity and moves
 * the case to `completed` (ZST export → `zst_done` is the following step).
 */
export function completeCase(
  input: CompletionInput,
  zstId: Id,
  now: ISODateTime,
  actor: Actor,
): CompletionDecision {
  if (input.openIssueCount > 0) {
    return { ok: false, error: 'cannot complete: case has open blocking issues' };
  }
  if (input.unsealedBoxCount > 0) {
    return { ok: false, error: 'cannot complete: case has unsealed boxes' };
  }
  if (input.confirmedQuantity < input.totalQuantity) {
    return {
      ok: false,
      error: 'cannot complete: confirmed quantity below total – use partial-complete',
    };
  }

  const zst = buildZst(input, input.confirmedQuantity, input.effortPoints, zstId, now);
  return {
    ok: true,
    caseStatus: 'completed',
    zst,
    remainingQuantity: 0,
    events: [
      eventDraft('case.completed', CASE_ENTITY, input.caseId, actor, {
        completedQuantity: zst.completedQuantity,
        effortPoints: zst.effortPoints,
      }),
      eventDraft('zst.created', ZST_ENTITY, zstId, actor, {
        caseId: input.caseId,
        completedQuantity: zst.completedQuantity,
        effortPoints: zst.effortPoints,
        partial: false,
      }),
    ],
  };
}

/**
 * Partial completion (§4.6). The finished part is shipped and booked into a ZST with
 * proportional effort; the case becomes `partially_completed` and the remainder is
 * planned for the next day. Requires a finished part and a non-zero remainder.
 */
export function partialComplete(
  input: CompletionInput,
  zstId: Id,
  now: ISODateTime,
  actor: Actor,
): CompletionDecision {
  const remaining = input.totalQuantity - input.confirmedQuantity;
  if (input.confirmedQuantity <= 0) {
    return { ok: false, error: 'cannot partial-complete: nothing confirmed yet' };
  }
  if (remaining <= 0) {
    return { ok: false, error: 'nothing remaining – use complete' };
  }

  const effort = proratedEffort(input.totalQuantity, input.confirmedQuantity, input.effortPoints);
  const zst = buildZst(input, input.confirmedQuantity, effort, zstId, now);
  return {
    ok: true,
    caseStatus: 'partially_completed',
    zst,
    remainingQuantity: remaining,
    events: [
      eventDraft('case.partially_completed', CASE_ENTITY, input.caseId, actor, {
        completedQuantity: input.confirmedQuantity,
        remainingQuantity: remaining,
        effortPoints: effort,
      }),
      eventDraft('zst.created', ZST_ENTITY, zstId, actor, {
        caseId: input.caseId,
        completedQuantity: input.confirmedQuantity,
        effortPoints: effort,
        partial: true,
      }),
    ],
  };
}

/**
 * Carry a partially completed case into the next day's pool. The remainder re-enters
 * planning as `ready` (§7.1 partially_completed → ready_next_day).
 */
export function carryOverToNextDay(
  caseId: Id,
  currentStatus: CaseStatus,
  actor: Actor,
):
  | { ok: true; caseStatus: CaseStatus; events: WorkflowEventDraft[] }
  | { ok: false; error: string } {
  if (currentStatus !== 'partially_completed') {
    return {
      ok: false,
      error: `only partially_completed cases carry over (got "${currentStatus}")`,
    };
  }
  return {
    ok: true,
    caseStatus: 'ready',
    events: [
      eventDraft('case.ready', CASE_ENTITY, caseId, actor, { reason: 'carry_over_next_day' }),
    ],
  };
}
