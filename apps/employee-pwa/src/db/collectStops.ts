/**
 * Builds the consolidated COLLECT pick list from the engine bundle.
 *
 * Pure and decoupled from the API client (the sync layer maps DTOs onto the
 * small input shapes here). When the engine route is present its order is kept
 * (route-ordered, §D.3); otherwise we group the bundle's cases by location and
 * fall back to a deterministic type-then-numeric order so the list is still
 * sensible offline.
 */
import type { CollectStop } from './types.js';

/** Engine route stop (subset of the DTO the pick list needs). */
export interface RouteStopInput {
  sequence: number;
  locationCode: string;
  scanRequired: boolean;
}

/** A case's storage location (subset of the case summary the pick list needs). */
export interface CaseLocationInput {
  caseId: string;
  storageLocationCode: string;
}

/** Split a location code into comparable chunks: "R27" → ['R', 27]. */
function sortKey(code: string): Array<string | number> {
  const parts = code.toUpperCase().match(/\d+|\D+/g);
  if (!parts) return [code.toUpperCase()];
  return parts.map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

function compareCodes(a: string, b: string): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i += 1) {
    const va = ka[i];
    const vb = kb[i];
    if (va === undefined) return -1;
    if (vb === undefined) return 1;
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return va - vb;
    } else {
      const cmp = String(va).localeCompare(String(vb));
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

function caseIdsAt(locationCode: string, cases: readonly CaseLocationInput[]): string[] {
  return cases.filter((c) => c.storageLocationCode === locationCode).map((c) => c.caseId);
}

/**
 * Build the route-ordered collect stops. Prefers the engine route; falls back to
 * grouping cases by location when the route is empty.
 */
export function buildCollectStops(
  routeStops: readonly RouteStopInput[],
  cases: readonly CaseLocationInput[],
): CollectStop[] {
  if (routeStops.length > 0) {
    return [...routeStops]
      .sort((a, b) => a.sequence - b.sequence)
      .map((stop) => ({
        sequence: stop.sequence,
        locationCode: stop.locationCode,
        scanRequired: stop.scanRequired,
        caseIds: caseIdsAt(stop.locationCode, cases),
      }));
  }

  const codes = [...new Set(cases.map((c) => c.storageLocationCode))].sort(compareCodes);
  return codes.map((locationCode, index) => ({
    sequence: index,
    locationCode,
    scanRequired: false,
    caseIds: caseIdsAt(locationCode, cases),
  }));
}
