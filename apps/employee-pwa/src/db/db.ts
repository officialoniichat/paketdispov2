/**
 * Dexie/IndexedDB store for the offline package (§12.4).
 *
 * Holds exactly the already-assigned work: one bundle, its case aggregates,
 * per-case progress and the client outbox. New assignments are never created
 * here — they require the server.
 */
import Dexie, { type Table } from 'dexie';
import type { AssignedBundle, CaseAggregate, CaseProgress } from './types.js';
import type { OutboxEntry } from '../offline/types.js';

export class PaketDb extends Dexie {
  bundles!: Table<AssignedBundle, string>;
  aggregates!: Table<CaseAggregate, string>;
  progress!: Table<CaseProgress, string>;
  outbox!: Table<OutboxEntry, string>;

  constructor(name = 'paket-employee') {
    super(name);
    this.version(1).stores({
      bundles: 'bundleId',
      aggregates: 'caseId',
      progress: 'caseId, bundleId, step',
      outbox: 'id, status, createdAt',
    });
  }
}

/** Singleton used by the app; tests construct their own named instance. */
export const db = new PaketDb();
