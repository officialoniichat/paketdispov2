import type { CaseStatus } from '@paket/domain-types';

/**
 * Case status transition graph (§7.1), mapped onto the Anhang A CaseStatus enum.
 *
 * Main flow:
 *   needs_review → ready → assigned → in_progress → completed → zst_done
 *
 * Sonderpfade (special paths):
 *   ready ↔ parked                              (deliberately held back)
 *   assigned → ready                            (unassigned_by_teamlead override)
 *   in_progress → issue_open → in_progress      (issue raised then resolved)
 *   in_progress → partially_completed → ready   (ready_next_day) | completed
 *
 * `cancelled` and `zst_done` are terminal.
 */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  needs_review: ['ready', 'cancelled'],
  ready: ['assigned', 'parked', 'cancelled'],
  parked: ['ready', 'cancelled'],
  assigned: ['in_progress', 'ready', 'cancelled'],
  in_progress: ['issue_open', 'partially_completed', 'completed', 'cancelled'],
  issue_open: ['in_progress', 'cancelled'],
  partially_completed: ['ready', 'completed', 'cancelled'],
  completed: ['zst_done', 'cancelled'],
  zst_done: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly CaseStatus[] = ['zst_done', 'cancelled'];

/** Transitions that only a teamlead may trigger (pool steering / overrides). */
export const TEAMLEAD_ONLY_TARGETS: readonly CaseStatus[] = ['parked'];

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
