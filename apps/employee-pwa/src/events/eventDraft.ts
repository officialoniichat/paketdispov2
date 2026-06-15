/**
 * Factory for immutable local event records. One place that stamps the
 * client id and timestamp so every producer is consistent.
 */
import type { AppEventType, LocalEvent } from './types.js';

export interface EventDraftInput {
  eventType: AppEventType;
  entityType: string;
  entityId: string;
  payload?: unknown;
}

let fallbackCounter = 0;

/** Stable client id; prefers crypto.randomUUID, falls back for old runtimes. */
function localId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  fallbackCounter += 1;
  return `evt-local-${fallbackCounter}`;
}

export function createEventDraft(input: EventDraftInput): LocalEvent {
  return {
    id: localId(),
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload ?? null,
    createdAt: new Date().toISOString(),
  };
}
