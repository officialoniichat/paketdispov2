/**
 * Skip handling: a worker may only skip a step *with a reason*, and every skip
 * becomes an auditable event (§E.3 "Skip nur mit Grund → Event").
 */
import { createEventDraft } from '../events/eventDraft.js';
import type { LocalEvent } from '../events/types.js';

export class SkipReasonRequiredError extends Error {
  constructor() {
    super('Überspringen ist nur mit Grund möglich');
    this.name = 'SkipReasonRequiredError';
  }
}

export interface SkipInput {
  entityType: string;
  entityId: string;
  reason: string;
  /** What was skipped, e.g. 'position' | 'prepare' – stored in the payload. */
  skipped: string;
}

/**
 * Build a `step.skipped` local event. Throws if no reason was given, so the UI
 * cannot record a reasonless skip.
 */
export function buildSkipEvent(input: SkipInput): LocalEvent {
  const reason = input.reason?.trim() ?? '';
  if (reason.length === 0) {
    throw new SkipReasonRequiredError();
  }
  return createEventDraft({
    eventType: 'step.skipped',
    entityType: input.entityType,
    entityId: input.entityId,
    payload: { skipped: input.skipped, reason },
  });
}
