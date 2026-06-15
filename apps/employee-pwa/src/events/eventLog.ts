/**
 * Dexie-backed local event log. Append-only record of what happened on the
 * device, ordered by createdAt. There is no sync: the log is purely local.
 */
import { db as defaultDb, type PaketDb } from '../db/db.js';
import type { LocalEvent } from './types.js';

/** Append an immutable event record to the local log. */
export async function append(event: LocalEvent, db: PaketDb = defaultDb): Promise<LocalEvent> {
  await db.events.add(event);
  return event;
}

/** Back-compat alias for producers that read like a queue. */
export const enqueue = append;

/** All recorded events, oldest first (createdAt order). */
export async function listEvents(db: PaketDb = defaultDb): Promise<LocalEvent[]> {
  return db.events.orderBy('createdAt').toArray();
}
