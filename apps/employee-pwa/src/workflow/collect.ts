/**
 * Pure selectors and reducer for the COLLECT phase. No I/O.
 *
 * The whole bundle is collected first: the worker drives the cart to every
 * Lagerplatz and checks each stop off. Processing is hard-gated until the pick
 * list is complete. Scanning is optional (a stop's `scanRequired` only drives
 * the scan affordance); checking off is the gate.
 */
import type { BundleProgress, CollectStop } from '../db/types.js';

/** Toggle a stop's collected state (immutable). The repository owns the version bump. */
export function toggleStop(progress: BundleProgress, sequence: number): BundleProgress {
  const collected = progress.collectedSequences.includes(sequence)
    ? progress.collectedSequences.filter((s) => s !== sequence)
    : [...progress.collectedSequences, sequence];
  return { ...progress, collectedSequences: collected };
}

/** True when every stop has been checked off (or there is nothing to collect). */
export function isCollectComplete(
  stops: readonly CollectStop[],
  progress: BundleProgress | undefined,
): boolean {
  if (stops.length === 0) return true;
  if (!progress) return false;
  const done = new Set(progress.collectedSequences);
  return stops.every((stop) => done.has(stop.sequence));
}

export interface CollectCounts {
  total: number;
  collected: number;
}

/** How many of the current stops are collected (sequences outside the list are ignored). */
export function collectCounts(
  stops: readonly CollectStop[],
  progress: BundleProgress | undefined,
): CollectCounts {
  const done = new Set(progress?.collectedSequences ?? []);
  return {
    total: stops.length,
    collected: stops.filter((stop) => done.has(stop.sequence)).length,
  };
}
