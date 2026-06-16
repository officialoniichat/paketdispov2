/**
 * Seeds the local store with the already-assigned example work on first run. In
 * production the day context + Beleg list arrive from the assignment endpoint
 * (system-only); here we provide the Anhang G beleg so the offline-demo flow
 * works end-to-end during the pilot.
 */
import { db as defaultDb, type PaketDb } from './db.js';
import { getDay, putAggregate, putBelege, putDay, putProgress } from './repository.js';
import { exampleAggregate, exampleBelegList, exampleDay } from '../domain/exampleAssignment.js';
import { initialProgress } from '../workflow/workflowModel.js';

export async function seedIfEmpty(db: PaketDb = defaultDb): Promise<void> {
  const existing = await getDay(db);
  if (existing) return;

  await putDay(exampleDay, db);
  await putBelege(exampleBelegList, db);
  await putAggregate(exampleAggregate, db);
  await putProgress(initialProgress(exampleAggregate, new Date().toISOString()), db);
}
