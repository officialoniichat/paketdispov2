/**
 * Client-Outbox & Sync types (§12.4 Offline-/Scanner-Konzept).
 *
 * Every mutating action appends an immutable event draft to the outbox; the
 * SyncEngine drains it against the backend when online, using `expectedVersion`
 * for optimistic locking. The backend stays the conflict authority.
 */
import type { WorkflowEventType } from '@paket/domain-types';

/**
 * Outbox event kinds. Superset of the backend WorkflowEventType plus app-local
 * `step.skipped` (Skip nur mit Grund → Event). The transport drops/translates
 * app-local kinds until the backend supports them (EPIC 3/4/5).
 */
export type AppEventType = WorkflowEventType | 'step.skipped';

export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';

export interface OutboxEntry {
  /** Client-generated id; stable across retries so the backend can dedupe. */
  id: string;
  eventType: AppEventType;
  entityType: string;
  entityId: string;
  /** Entity version the client believed current when the action happened. */
  expectedVersion?: number;
  payload: unknown;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
}

/** Sync-Banner state surfaced to the worker (colour + text, never colour alone). */
export type SyncBannerState = 'synced' | 'pending' | 'syncing' | 'offline' | 'conflict';

export interface SyncSnapshot {
  state: SyncBannerState;
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt?: string;
}
