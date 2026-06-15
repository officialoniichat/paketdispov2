import type { CaseStatus } from '@paket/domain-types';

/**
 * Case status transition graph (§7.1), mapped onto the Anhang A CaseStatus enum.
 *
 * Main flow:
 *   imported → parsed → needs_review → ready → assigned → picking → preparing
 *   → sorting → checking → labeling/securing → boxing → completed → zst_done
 *
 * Sonderpfade (special paths) preserved:
 *   ready ↔ parked                              (deliberately held back)
 *   parsed → needs_review → ready               (low parser confidence)
 *   assigned → ready                            (unassigned_by_teamlead override)
 *   …work… → issue_open → waiting_teamlead → released → …work…
 *   boxing → partially_completed → ready        (ready_next_day) | completed
 *
 * `cancelled` and `zst_done` are terminal.
 */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  imported: ['parsed', 'cancelled'],
  parsed: ['needs_review', 'ready', 'cancelled'],
  needs_review: ['ready', 'parked', 'cancelled'],
  ready: ['assigned', 'parked', 'cancelled'],
  parked: ['ready', 'cancelled'],
  // assigned → ready models the teamlead "unassigned_by_teamlead" override.
  assigned: ['picking', 'ready', 'cancelled'],
  picking: ['preparing', 'issue_open', 'cancelled'],
  preparing: ['sorting', 'issue_open', 'cancelled'],
  sorting: ['checking', 'issue_open', 'cancelled'],
  checking: ['labeling', 'securing', 'boxing', 'issue_open', 'cancelled'],
  labeling: ['securing', 'boxing', 'issue_open', 'cancelled'],
  securing: ['labeling', 'boxing', 'issue_open', 'cancelled'],
  boxing: ['completed', 'partially_completed', 'issue_open', 'cancelled'],
  issue_open: ['waiting_teamlead', 'cancelled'],
  waiting_teamlead: ['released', 'cancelled'],
  // After release the case resumes at the work step where it was blocked.
  released: ['picking', 'preparing', 'sorting', 'checking', 'labeling', 'securing', 'boxing'],
  // partially_completed → ready models "ready_next_day".
  partially_completed: ['ready', 'completed', 'cancelled'],
  completed: ['zst_done', 'cancelled'],
  zst_done: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly CaseStatus[] = ['zst_done', 'cancelled'];

/** Statuses an employee may drive directly while working their own package. */
export const EMPLOYEE_WORK_STATUSES: readonly CaseStatus[] = [
  'picking',
  'preparing',
  'sorting',
  'checking',
  'labeling',
  'securing',
  'boxing',
  'issue_open',
  'completed',
  'partially_completed',
];

/** Transitions that only a teamlead may trigger (pool steering / overrides). */
export const TEAMLEAD_ONLY_TARGETS: readonly CaseStatus[] = [
  'parked',
  'released',
  'waiting_teamlead',
];

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
