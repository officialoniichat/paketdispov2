/**
 * Seeds the local store with one already-assigned example bundle on first run.
 * In production the bundle + collect list arrive from GET /api/me/today
 * (system-only assignment); here we provide the Anhang G bundle so the
 * offline-demo two-phase flow (COLLECT → PROCESS → DONE) works end-to-end.
 */
import { db as defaultDb, type PaketDb } from './db.js';
import {
  getBundle,
  putAggregate,
  putBelege,
  putBundle,
  putBundleProgress,
  putCollectStops,
  putProgress,
} from './repository.js';
import {
  exampleAggregates,
  exampleBelegList,
  exampleBundle,
  exampleCollectStops,
} from '../domain/exampleAssignment.js';
import { initialProgress } from '../workflow/workflowModel.js';

export async function seedIfEmpty(db: PaketDb = defaultDb): Promise<void> {
  const existing = await getBundle(db);
  if (existing) return;

  const now = new Date().toISOString();
  await putBundle(exampleBundle, db);
  await putCollectStops(exampleCollectStops, db);
  await putBundleProgress({ id: 'today', collectedSequences: [], version: 0, updatedAt: now }, db);
  await putBelege(exampleBelegList, db);

  for (const aggregate of exampleAggregates) {
    await putAggregate(aggregate, db);
    await putProgress(initialProgress(aggregate, now), db);
  }
}
