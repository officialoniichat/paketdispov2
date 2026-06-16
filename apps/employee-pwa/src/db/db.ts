/**
 * Dexie/IndexedDB store for the employee app.
 *
 * Holds exactly the already-assigned work: the day context, the assigned Beleg
 * list, case aggregates, per-case progress and a local append-only event log.
 * Assignment is never created here — it requires the server.
 */
import Dexie, { type Table } from 'dexie';
import type { BelegListItem, CaseAggregate, CaseProgress, DayContext } from './types.js';
import type { LocalEvent } from '../events/types.js';

export class PaketDb extends Dexie {
  day!: Table<DayContext, string>;
  belege!: Table<BelegListItem, string>;
  aggregates!: Table<CaseAggregate, string>;
  progress!: Table<CaseProgress, string>;
  events!: Table<LocalEvent, string>;

  constructor(name = 'paket-employee') {
    super(name);
    // v3: dropped the single forced "bundles" table (AssignedBundle/PickupStop)
    // in favour of a day-context row + a selectable Beleg list. Bump required so
    // existing clients re-create the store instead of throwing a SchemaError.
    this.version(3).stores({
      day: 'id',
      belege: 'caseId, prioRank',
      aggregates: 'caseId',
      progress: 'caseId, step',
      events: 'id, createdAt',
    });
  }
}

/** Singleton used by the app; tests construct their own named instance. */
export const db = new PaketDb();
