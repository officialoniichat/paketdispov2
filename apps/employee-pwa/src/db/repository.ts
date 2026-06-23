/**
 * Read/write access to the local store with optimistic locking.
 *
 * saveProgress / saveBundleProgress enforce the version the caller read against
 * the on-disk value, mirroring the backend's optimistic-locking contract (§12.4)
 * so local writes fail fast on a stale base instead of silently overwriting.
 */
import { db as defaultDb, type PaketDb } from './db.js';
import type {
  BelegListItem,
  BundleContext,
  BundleProgress,
  CaseAggregate,
  CaseProgress,
  CollectStop,
} from './types.js';

export class OptimisticLockError extends Error {
  constructor(
    readonly entityId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Versionskonflikt bei ${entityId}: erwartet ${expected}, gefunden ${actual}`);
    this.name = 'OptimisticLockError';
  }
}

// --- Bundle context -------------------------------------------------------

export async function getBundle(db: PaketDb = defaultDb): Promise<BundleContext | undefined> {
  return db.bundle.get('today');
}

export async function putBundle(bundle: BundleContext, db: PaketDb = defaultDb): Promise<void> {
  await db.bundle.put(bundle);
}

// --- Collect stops + collect progress ------------------------------------

export async function getCollectStops(db: PaketDb = defaultDb): Promise<CollectStop[]> {
  return db.collectStops.orderBy('sequence').toArray();
}

export async function putCollectStops(stops: CollectStop[], db: PaketDb = defaultDb): Promise<void> {
  await db.collectStops.bulkPut(stops);
}

export async function getBundleProgress(
  db: PaketDb = defaultDb,
): Promise<BundleProgress | undefined> {
  return db.bundleProgress.get('today');
}

export async function putBundleProgress(
  progress: BundleProgress,
  db: PaketDb = defaultDb,
): Promise<void> {
  await db.bundleProgress.put(progress);
}

/**
 * Persist a new collect-progress revision under optimistic locking. Mirrors
 * saveProgress: the stored row is written at `expectedVersion + 1` and a
 * concurrent toggle that moved the version is rejected.
 */
export async function saveBundleProgress(
  next: BundleProgress,
  expectedVersion: number,
  db: PaketDb = defaultDb,
): Promise<BundleProgress> {
  return db.transaction('rw', db.bundleProgress, async () => {
    const current = await db.bundleProgress.get('today');
    const actual = current?.version ?? expectedVersion;
    if (current && actual !== expectedVersion) {
      throw new OptimisticLockError('today', expectedVersion, actual);
    }
    const saved: BundleProgress = {
      ...next,
      version: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    await db.bundleProgress.put(saved);
    return saved;
  });
}

// --- Beleg list -----------------------------------------------------------

export async function getBelege(db: PaketDb = defaultDb): Promise<BelegListItem[]> {
  return db.belege.toArray();
}

export async function putBelege(items: BelegListItem[], db: PaketDb = defaultDb): Promise<void> {
  await db.belege.bulkPut(items);
}

// --- Case aggregate + progress -------------------------------------------

export async function getAggregate(
  caseId: string,
  db: PaketDb = defaultDb,
): Promise<CaseAggregate | undefined> {
  return db.aggregates.get(caseId);
}

export async function getProgress(
  caseId: string,
  db: PaketDb = defaultDb,
): Promise<CaseProgress | undefined> {
  return db.progress.get(caseId);
}

export async function putAggregate(agg: CaseAggregate, db: PaketDb = defaultDb): Promise<void> {
  await db.aggregates.put(agg);
}

/** Initial persist of a progress row (version stays as provided, typically 0). */
export async function putProgress(progress: CaseProgress, db: PaketDb = defaultDb): Promise<void> {
  await db.progress.put(progress);
}

/**
 * Reconcile the local progress version with the backend's authoritative version
 * after a server transition. The backend owns the case version (§12.4); once a
 * transition is persisted we adopt its value so the local row no longer drifts.
 * No-op when the row is missing or the version is unchanged.
 */
export async function reconcileVersion(
  caseId: string,
  serverVersion: number,
  db: PaketDb = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.progress, async () => {
    const current = await db.progress.get(caseId);
    if (!current || current.version === serverVersion) return;
    await db.progress.put({ ...current, version: serverVersion });
  });
}

/**
 * Persist a new progress revision. `expectedVersion` is the version the caller
 * read; the stored row is written at `expectedVersion + 1`. Throws
 * OptimisticLockError when the on-disk version moved underneath the caller.
 */
export async function saveProgress(
  next: CaseProgress,
  expectedVersion: number,
  db: PaketDb = defaultDb,
): Promise<CaseProgress> {
  return db.transaction('rw', db.progress, async () => {
    const current = await db.progress.get(next.caseId);
    const actual = current?.version ?? expectedVersion;
    if (current && actual !== expectedVersion) {
      throw new OptimisticLockError(next.caseId, expectedVersion, actual);
    }
    const saved: CaseProgress = {
      ...next,
      version: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    await db.progress.put(saved);
    return saved;
  });
}
