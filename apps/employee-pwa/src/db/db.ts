/**
 * Dexie/IndexedDB store for the employee app.
 *
 * Holds exactly the engine's assigned work for the day: the bundle context, its
 * route-ordered collect stops, the bundle-level collect progress, the assigned
 * Beleg list, per-case aggregates, per-case progress and a local append-only
 * event log. Assignment is never created here — it requires the server.
 */
import Dexie, { type Table } from 'dexie';
import type {
  BelegListItem,
  BundleContext,
  BundleProgress,
  CaseAggregate,
  CaseProgress,
  CollectStop,
} from './types.js';
import type { LocalEvent } from '../events/types.js';

export class PaketDb extends Dexie {
  bundle!: Table<BundleContext, string>;
  collectStops!: Table<CollectStop, number>;
  bundleProgress!: Table<BundleProgress, string>;
  belege!: Table<BelegListItem, string>;
  aggregates!: Table<CaseAggregate, string>;
  progress!: Table<CaseProgress, string>;
  events!: Table<LocalEvent, string>;

  constructor(name = 'paket-employee') {
    super(name);
    // v4: re-introduces the engine bundle the v3 migration had dropped. The flat
    // free-pick "day" row is replaced by a bundle context + a route-ordered
    // collect-stop list + bundle collect progress. Bump required so existing
    // clients re-create the store instead of throwing a SchemaError.
    this.version(4).stores({
      bundle: 'id',
      collectStops: 'sequence',
      bundleProgress: 'id',
      belege: 'caseId, order',
      aggregates: 'caseId',
      progress: 'caseId, step',
      events: 'id, createdAt',
    });
    // v5 (Dustin-Feedback 03.07.2026): CaseProgress verliert die §G.2 Schritte
    // (labelsPrinted/cartonOpened) und gewinnt confirmedQuantities; BelegListItem
    // trägt Lagerplatz-Art/Warenart/Etiketten-Flag. Alte Zeilen passen nicht mehr
    // aufs neue Modell → Arbeitsdaten leeren; der nächste Sync/Seed füllt frisch.
    this.version(5)
      .stores({
        bundle: 'id',
        collectStops: 'sequence',
        bundleProgress: 'id',
        belege: 'caseId, order',
        aggregates: 'caseId',
        progress: 'caseId, step',
        events: 'id, createdAt',
      })
      .upgrade(async (tx) => {
        await Promise.all(
          ['bundle', 'collectStops', 'bundleProgress', 'belege', 'aggregates', 'progress'].map(
            (table) => tx.table(table).clear(),
          ),
        );
      });
  }
}

/** Singleton used by the app; tests construct their own named instance. */
export const db = new PaketDb();
