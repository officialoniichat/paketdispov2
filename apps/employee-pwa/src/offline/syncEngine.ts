/**
 * Drains the client outbox against a SyncTransport. Sequential by createdAt so
 * causally-ordered events apply in order. Conflicts are surfaced (not retried)
 * because the backend is the optimistic-locking authority (§12.4).
 *
 * Callers must only invoke runSync when online; offline work just keeps
 * appending to the outbox.
 */
import { db as defaultDb, type PaketDb } from '../db/db.js';
import { listSyncable, setStatus } from './outboxStore.js';
import { mockTransport, type SyncTransport } from './transport.js';

export interface SyncRunResult {
  synced: number;
  conflicts: number;
  errors: number;
}

export async function runSync(
  transport: SyncTransport = mockTransport,
  db: PaketDb = defaultDb,
): Promise<SyncRunResult> {
  const pending = await listSyncable(db);
  let synced = 0;
  let conflicts = 0;
  let errors = 0;

  for (const entry of pending) {
    await setStatus(entry.id, 'syncing', {}, db);
    try {
      const result = await transport.send(entry);
      if (result.kind === 'accepted') {
        await setStatus(entry.id, 'synced', {}, db);
        synced += 1;
      } else if (result.kind === 'conflict') {
        await setStatus(
          entry.id,
          'conflict',
          { lastError: `Server-Version ${result.serverVersion}` },
          db,
        );
        conflicts += 1;
      } else {
        await setStatus(
          entry.id,
          'failed',
          { attempts: entry.attempts + 1, lastError: result.message },
          db,
        );
        errors += 1;
      }
    } catch (err) {
      await setStatus(
        entry.id,
        'failed',
        {
          attempts: entry.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        },
        db,
      );
      errors += 1;
    }
  }

  return { synced, conflicts, errors };
}
