/**
 * Local event-log types.
 *
 * Every mutating action appends an immutable record to an append-only local
 * event log. There is no sync concept: the log is the app's local record of
 * what happened (e.g. "Skip nur mit Grund → Event", reported problems).
 */
import type { WorkflowEventType } from '@paket/domain-types';

/**
 * Local event kinds. Superset of the backend WorkflowEventType plus app-local
 * `step.skipped` (Skip nur mit Grund → Event).
 */
export type AppEventType = WorkflowEventType | 'step.skipped';

export interface LocalEvent {
  /** Client-generated id; stable per record. */
  id: string;
  eventType: AppEventType;
  entityType: string;
  entityId: string;
  payload: unknown;
  createdAt: string;
}
