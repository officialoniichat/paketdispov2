import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PaketDb } from '../db/db.js';
import { createEventDraft } from './eventDraft.js';
import { enqueue, listByStatus } from './outboxStore.js';
import { runSync } from './syncEngine.js';
import type { SyncTransport } from './transport.js';

let counter = 0;
const newDb = (): PaketDb => new PaketDb(`test-sync-${counter++}`);

function caseStartedDraft() {
  return createEventDraft({
    eventType: 'case.started',
    entityType: 'case',
    entityId: 'c1',
    expectedVersion: 0,
  });
}

describe('runSync', () => {
  it('marks accepted entries as synced (default mock transport)', async () => {
    const db = newDb();
    await enqueue(caseStartedDraft(), db);

    const result = await runSync(undefined, db);
    expect(result.synced).toBe(1);
    expect((await listByStatus('synced', db)).length).toBe(1);
  });

  it('surfaces conflicts without retrying', async () => {
    const db = newDb();
    await enqueue(caseStartedDraft(), db);

    const conflictTransport: SyncTransport = {
      async send() {
        return { kind: 'conflict', serverVersion: 5 };
      },
    };

    const result = await runSync(conflictTransport, db);
    expect(result.conflicts).toBe(1);
    expect((await listByStatus('conflict', db)).length).toBe(1);
  });
});
