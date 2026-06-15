import type { CaseStatus } from '@paket/domain-types';
import { CASE_TRANSITIONS, isTerminal } from './case-status.js';

/** Raised when a status edge is not permitted by the §7.1 transition graph. */
export class InvalidCaseTransitionError extends Error {
  constructor(
    readonly from: CaseStatus,
    readonly to: CaseStatus,
  ) {
    super(`Illegal case transition: ${from} → ${to}`);
    this.name = 'InvalidCaseTransitionError';
  }
}

export function nextStatuses(from: CaseStatus): readonly CaseStatus[] {
  return CASE_TRANSITIONS[from] ?? [];
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return nextStatuses(from).includes(to);
}

/** Throws {@link InvalidCaseTransitionError} unless `from → to` is a legal edge. */
export function assertTransition(from: CaseStatus, to: CaseStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidCaseTransitionError(from, to);
  }
}

export { isTerminal };
