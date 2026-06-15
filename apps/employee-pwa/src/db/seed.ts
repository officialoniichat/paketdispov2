/**
 * Seeds the local store with the already-assigned example package on first
 * run. In production the bundle would arrive from the assignment endpoint
 * (EPIC 3/4); here we provide the Anhang G beleg so the flow works end-to-end
 * during the pilot.
 */
import { db as defaultDb, type PaketDb } from './db.js';
import { getActiveBundle, putAggregate, putBundle, putProgress } from './repository.js';
import { exampleAggregate, exampleBundle } from '../domain/exampleAssignment.js';
import { initialProgress } from '../workflow/workflowModel.js';

export async function seedIfEmpty(db: PaketDb = defaultDb): Promise<void> {
  const existing = await getActiveBundle(db);
  if (existing) return;

  await putBundle(exampleBundle, db);
  await putAggregate(exampleAggregate, db);
  await putProgress(
    initialProgress(exampleAggregate, exampleBundle.bundleId, new Date().toISOString()),
    db,
  );
}
