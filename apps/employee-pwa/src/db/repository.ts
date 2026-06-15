/**
 * Read/write access to the local store with optimistic locking.
 *
 * saveProgress enforces the version the caller read against the on-disk value,
 * mirroring the backend's optimistic-locking contract (§12.4) so local writes
 * fail fast on a stale base instead of silently overwriting.
 */
import { db as defaultDb, type PaketDb } from './db.js';
import type { AssignedBundle, CaseAggregate, CaseProgress } from './types.js';

export class OptimisticLockError extends Error {
  constructor(
    readonly caseId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Versionskonflikt bei ${caseId}: erwartet ${expected}, gefunden ${actual}`);
    this.name = 'OptimisticLockError';
  }
}

export async function getActiveBundle(db: PaketDb = defaultDb): Promise<AssignedBundle | undefined> {
  const bundles = await db.bundles.toArray();
  return bundles[0];
}

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

export async function putBundle(bundle: AssignedBundle, db: PaketDb = defaultDb): Promise<void> {
  await db.bundles.put(bundle);
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
