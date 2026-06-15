/**
 * Factory for immutable outbox event drafts. One place that stamps the
 * client id, timestamp and initial status so every producer is consistent.
 */
import type { AppEventType, OutboxEntry } from './types.js';

export interface EventDraftInput {
  eventType: AppEventType;
  entityType: string;
  entityId: string;
  expectedVersion?: number;
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

export function createEventDraft(input: EventDraftInput): OutboxEntry {
  return {
    id: localId(),
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    expectedVersion: input.expectedVersion,
    payload: input.payload ?? null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
  };
}
