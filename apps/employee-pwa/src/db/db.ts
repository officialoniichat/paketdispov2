/**
 * Dexie/IndexedDB store for the employee app.
 *
 * Holds exactly the already-assigned work: one bundle, its case aggregates,
 * per-case progress and a local append-only event log. New assignments are
 * never created here — they require the server.
 */
import Dexie, { type Table } from 'dexie';
import type { AssignedBundle, CaseAggregate, CaseProgress } from './types.js';
import type { LocalEvent } from '../events/types.js';

export class PaketDb extends Dexie {
  bundles!: Table<AssignedBundle, string>;
  aggregates!: Table<CaseAggregate, string>;
  progress!: Table<CaseProgress, string>;
  events!: Table<LocalEvent, string>;

  constructor(name = 'paket-employee') {
    super(name);
    // v2: dropped the sync-flavoured "outbox" (status index) in favour of a
    // plain local event log. Bump required so existing clients re-create the
    // store with the new index instead of throwing a SchemaError.
    this.version(2).stores({
      bundles: 'bundleId',
      aggregates: 'caseId',
      progress: 'caseId, bundleId, step',
      events: 'id, createdAt',
    });
  }
}

/** Singleton used by the app; tests construct their own named instance. */
export const db = new PaketDb();
