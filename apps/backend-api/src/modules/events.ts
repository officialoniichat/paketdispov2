import type { ActorType, Id, WorkflowEventType } from '@paket/domain-types';

/**
 * Domain logic produces *event drafts* (no id / no timestamp). The persistence
 * adapter stamps id + timestamp and appends them to the tamper-protected log
 * (§7.2). Keeping drafts pure makes the domain logic deterministic and testable.
 */
export interface WorkflowEventDraft<TPayload = unknown> {
  eventType: WorkflowEventType;
  entityType: string;
  entityId: Id;
  actorType: ActorType;
  actorId?: Id;
  payload: TPayload;
  correlationId?: string;
}

/** Actor that triggered a domain action (request-scoped). */
export interface Actor {
  type: ActorType;
  id: Id;
}

/** Build a well-typed event draft; the single place that shapes audit events. */
export function eventDraft<TPayload>(
  eventType: WorkflowEventType,
  entityType: string,
  entityId: Id,
  actor: Actor,
  payload: TPayload,
  correlationId?: string,
): WorkflowEventDraft<TPayload> {
  return {
    eventType,
    entityType,
    entityId,
    actorType: actor.type,
    actorId: actor.id,
    payload,
    correlationId,
  };
}

/**
 * Append-only sink consumed by services that must persist asynchronously.
 * The in-process implementation wraps the tamper-protected event-log service
 * (EPIC 3); a pure array-backed implementation is used in tests.
 */
export interface EventSink {
  append(draft: WorkflowEventDraft): Promise<void>;
}
