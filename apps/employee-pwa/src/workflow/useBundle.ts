/**
 * Binds the bundle context + COLLECT phase to the local store. Exposes the
 * route-ordered pick list and the bundle-level collect progress, and persists a
 * stop check-off under optimistic locking (mirroring useCaseFlow). Reads are
 * live so the hub and collect screen reflect the latest local state.
 */
import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createEventDraft } from '../events/eventDraft.js';
import { append } from '../events/eventLog.js';
import {
  getBelege,
  getBundle,
  getBundleProgress,
  getCollectStops,
  OptimisticLockError,
  saveBundleProgress,
} from '../db/repository.js';
import type { BelegListItem, BundleContext, BundleProgress, CollectStop } from '../db/types.js';
import { collectCounts, isCollectComplete, toggleStop as toggleStopTx } from './collect.js';

export interface BundleView {
  loading: boolean;
  bundle?: BundleContext;
  stops: CollectStop[];
  collectProgress?: BundleProgress;
  belege: BelegListItem[];
  collectComplete: boolean;
  counts: { total: number; collected: number };
  toggleStop: (sequence: number) => Promise<void>;
}

export function useBundle(): BundleView {
  const bundle = useLiveQuery(() => getBundle(), []);
  const stops = useLiveQuery(() => getCollectStops(), []);
  const collectProgress = useLiveQuery(() => getBundleProgress(), []);
  const belege = useLiveQuery(() => getBelege(), []);

  const toggleStop = useCallback(async (sequence: number): Promise<void> => {
    const current = await getBundleProgress();
    if (!current) return;
    const next = toggleStopTx(current, sequence);
    try {
      await saveBundleProgress(next, current.version);
      await append(
        createEventDraft({
          eventType: 'pickup.location_scanned',
          entityType: 'collect_stop',
          entityId: `stop-${sequence}`,
          payload: { sequence, collected: next.collectedSequences.includes(sequence) },
        }),
      );
    } catch (err) {
      // Stale base: the live query will refresh and the toggle can be retried.
      if (!(err instanceof OptimisticLockError)) throw err;
    }
  }, []);

  const stopList = stops ?? [];

  return {
    loading: bundle === undefined || stops === undefined || collectProgress === undefined,
    bundle,
    stops: stopList,
    collectProgress,
    belege: belege ?? [],
    collectComplete: isCollectComplete(stopList, collectProgress),
    counts: collectCounts(stopList, collectProgress),
    toggleStop,
  };
}
