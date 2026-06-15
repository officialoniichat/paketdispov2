import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PaketDb } from './db.js';
import { getProgress, OptimisticLockError, putProgress, saveProgress } from './repository.js';
import { confirmPickup, initialProgress } from '../workflow/workflowModel.js';
import { exampleAggregate } from '../domain/exampleAssignment.js';

let counter = 0;
const newDb = (): PaketDb => new PaketDb(`test-repo-${counter++}`);
const baseProgress = () =>
  initialProgress(exampleAggregate, 'bundle-test', '2026-06-15T00:00:00.000Z');

describe('saveProgress optimistic locking', () => {
  it('increments the version and persists the change', async () => {
    const db = newDb();
    const p0 = baseProgress();
    await putProgress(p0, db);

    const saved = await saveProgress(confirmPickup(p0), p0.version, db);
    expect(saved.version).toBe(1);

    const reread = await getProgress(p0.caseId, db);
    expect(reread?.version).toBe(1);
    expect(reread?.pickupConfirmed).toBe(true);
  });

  it('rejects a write based on a stale version', async () => {
    const db = newDb();
    const p0 = baseProgress();
    await putProgress(p0, db);
    await saveProgress(confirmPickup(p0), 0, db); // store now at version 1

    await expect(saveProgress(confirmPickup(p0), 0, db)).rejects.toBeInstanceOf(OptimisticLockError);
  });
});
