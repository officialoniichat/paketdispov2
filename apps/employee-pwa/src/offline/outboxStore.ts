/**
 * Dexie-backed client outbox. Append-only queue of event drafts; the SyncEngine
 * drains it and updates statuses. Reads are ordered by createdAt so events sync
 * in the order they happened.
 */
import { db as defaultDb, type PaketDb } from '../db/db.js';
import type { OutboxEntry, OutboxStatus } from './types.js';

export async function enqueue(entry: OutboxEntry, db: PaketDb = defaultDb): Promise<OutboxEntry> {
  await db.outbox.add(entry);
  return entry;
}

export async function enqueueMany(entries: OutboxEntry[], db: PaketDb = defaultDb): Promise<void> {
  if (entries.length === 0) return;
  await db.outbox.bulkAdd(entries);
}

/** Entries still needing a sync attempt (pending or previously failed). */
export async function listSyncable(db: PaketDb = defaultDb): Promise<OutboxEntry[]> {
  const entries = await db.outbox.where('status').anyOf('pending', 'failed').toArray();
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listByStatus(
  status: OutboxStatus,
  db: PaketDb = defaultDb,
): Promise<OutboxEntry[]> {
  return db.outbox.where('status').equals(status).toArray();
}

export async function countByStatus(status: OutboxStatus, db: PaketDb = defaultDb): Promise<number> {
  return db.outbox.where('status').equals(status).count();
}

export async function setStatus(
  id: string,
  status: OutboxStatus,
  patch: Partial<OutboxEntry> = {},
  db: PaketDb = defaultDb,
): Promise<void> {
  await db.outbox.update(id, { status, ...patch });
}
