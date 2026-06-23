/**
 * Offline-demo seeding. On first run the selected demo scenario (a Belegset) is
 * mirrored into Dexie so the two-phase flow works without a backend. The demo
 * controls can switch scenarios / reset the data via {@link resetToScenario}.
 * In production the bundle arrives from GET /api/me/today (system-only).
 */
import { db as defaultDb, type PaketDb } from './db.js';
import {
  putAggregate,
  putBelege,
  putBundle,
  putBundleProgress,
  putCollectStops,
  putProgress,
  getBundle,
} from './repository.js';
import { DEFAULT_SCENARIO_ID, DEMO_SCENARIOS, getScenario } from '../demo/scenarios.js';
import { initialProgress } from '../workflow/workflowModel.js';

const SCENARIO_KEY = 'paket.demo.scenario';

/** The persisted demo-scenario id (localStorage), or the default. */
export function getSelectedScenarioId(): string {
  try {
    return localStorage.getItem(SCENARIO_KEY) ?? DEFAULT_SCENARIO_ID;
  } catch {
    return DEFAULT_SCENARIO_ID;
  }
}

function setSelectedScenarioId(id: string): void {
  try {
    localStorage.setItem(SCENARIO_KEY, id);
  } catch {
    // Non-fatal: scenario simply won't persist across reloads.
  }
}

/** Write a scenario's bundle + collect list + belege + aggregates into Dexie. */
async function seedScenario(scenarioId: string, db: PaketDb): Promise<void> {
  const { bundle, collectStops, belege, aggregates } = getScenario(scenarioId).build();
  const now = new Date().toISOString();
  await putBundle(bundle, db);
  await putCollectStops(collectStops, db);
  await putBundleProgress({ id: 'today', collectedSequences: [], version: 0, updatedAt: now }, db);
  await putBelege(belege, db);
  for (const aggregate of aggregates) {
    await putAggregate(aggregate, db);
    await putProgress(initialProgress(aggregate, now), db);
  }
}

export async function seedIfEmpty(db: PaketDb = defaultDb): Promise<void> {
  if (await getBundle(db)) return;
  await seedScenario(getSelectedScenarioId(), db);
}

/**
 * Demo control: wipe all local work data and reseed the chosen scenario. Used by
 * the offline DemoControls to switch Belegsets or reset to a clean state.
 */
/**
 * Offline continuation: simulate "Nächstes Bündel holen" by advancing to the next
 * demo Belegset (round-robin) and reseeding it. Returns the new scenario's label.
 */
export async function cycleDemoScenario(db: PaketDb = defaultDb): Promise<string> {
  const ids = DEMO_SCENARIOS.map((s) => s.id);
  const idx = ids.indexOf(getSelectedScenarioId());
  const nextId = ids[(idx + 1) % ids.length] ?? DEFAULT_SCENARIO_ID;
  await resetToScenario(nextId, db);
  return getScenario(nextId).label;
}

export async function resetToScenario(
  scenarioId: string,
  db: PaketDb = defaultDb,
): Promise<void> {
  setSelectedScenarioId(scenarioId);
  await db.bundle.clear();
  await db.collectStops.clear();
  await db.bundleProgress.clear();
  await db.belege.clear();
  await db.aggregates.clear();
  await db.progress.clear();
  await db.events.clear();
  await seedScenario(scenarioId, db);
}
