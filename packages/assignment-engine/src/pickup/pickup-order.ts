import {
  bundlePickupSequenceSchema,
  type BundlePickupSequence,
  type Id,
  type ISODateTime,
  type LocationMaster,
  type LocationType,
  type PickupSequenceMode,
  type RouteStop,
  type StorageLocation,
} from '@paket/domain-types';

/**
 * §D.3 Abholreihenfolge — order the storage locations INSIDE an already-finished
 * bundle. LEITPLANKE (Anhang D/H): this is explicitly NOT a route optimisation and
 * NOT an assignment criterion. It receives a bundle that the assignment engine has
 * already decided, and only produces the binding pick order shown in the app
 * ("erst Lagerplatz X, dann Y, dann Z"). It never reads the pool and therefore cannot
 * feed back into which cases get bundled together.
 */

const TYPE_ORDER: Record<LocationType, number> = {
  regal: 0,
  palette: 1,
  haengebahn: 2,
  lagerplatz_d: 3,
  workstation: 4,
  printer: 5,
  conveyor: 6,
};

/** One assigned case with the storage location its carton sits in. */
export interface PickupCase {
  caseId: Id;
  location: StorageLocation;
}

export interface PickupOptions {
  /** numeric_fallback (type + number) or manual_sort_order (admin order). */
  mode?: PickupSequenceMode;
  /** Manual location order (location ids), used in manual_sort_order mode. */
  orderedLocationIds?: readonly Id[];
  /** Location master keyed by code, for scan codes / sequence indices. */
  locationMaster?: ReadonlyMap<string, LocationMaster>;
  scanRequiredDefault?: boolean;
  /** Caller-supplied timestamp for deterministic output. */
  calculatedAt?: ISODateTime;
}

function numericParts(code: string): number[] {
  const matches = code.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

function compareNumericParts(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Stable type+number order (rule D.3 a) — the default fallback. */
function compareByTypeAndNumber(a: StorageLocation, b: StorageLocation): number {
  const ta = TYPE_ORDER[a.type];
  const tb = TYPE_ORDER[b.type];
  if (ta !== tb) return ta - tb;
  const np = compareNumericParts(numericParts(a.code), numericParts(b.code));
  if (np !== 0) return np;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

interface LocationGroup {
  location: StorageLocation;
  caseIds: Id[];
}

function groupByLocation(cases: readonly PickupCase[]): LocationGroup[] {
  const groups = new Map<Id, LocationGroup>();
  for (const { caseId, location } of cases) {
    const existing = groups.get(location.id);
    if (existing) {
      existing.caseIds.push(caseId);
    } else {
      groups.set(location.id, { location, caseIds: [caseId] });
    }
  }
  // Deterministic order of case ids within each stop.
  for (const group of groups.values()) {
    group.caseIds.sort();
  }
  return [...groups.values()];
}

/**
 * Build the binding pickup sequence for a finished bundle (§D.3).
 * Returns a validated {@link BundlePickupSequence}.
 */
export function buildPickupSequence(
  bundleId: Id,
  employeeId: Id,
  startLocationId: Id,
  cases: readonly PickupCase[],
  options: PickupOptions = {},
): BundlePickupSequence {
  const mode: PickupSequenceMode = options.mode ?? 'numeric_fallback';
  const scanDefault = options.scanRequiredDefault ?? true;
  const manualRank = new Map<Id, number>();
  if (mode === 'manual_sort_order' && options.orderedLocationIds) {
    options.orderedLocationIds.forEach((id, index) => manualRank.set(id, index));
  }

  const groups = groupByLocation(cases);

  groups.sort((a, b) => {
    if (mode === 'manual_sort_order') {
      // Rule D.3 b: manual order first; anything not listed falls back to type+number.
      const ra = manualRank.get(a.location.id) ?? Number.POSITIVE_INFINITY;
      const rb = manualRank.get(b.location.id) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
    }
    return compareByTypeAndNumber(a.location, b.location);
  });

  const stops: RouteStop[] = groups.map((group, index) => {
    const master = options.locationMaster?.get(group.location.code);
    const scanRequired = master?.scanCode !== undefined ? true : scanDefault;
    return {
      sequence: index,
      locationId: group.location.id,
      locationCode: group.location.code,
      orderIds: group.caseIds,
      scanRequired,
      skipAllowedWithReason: true,
    };
  });

  return bundlePickupSequenceSchema.parse({
    bundleId,
    employeeId,
    startLocationId,
    stops,
    calculationMode: mode,
    calculatedAt: options.calculatedAt ?? new Date().toISOString(),
  });
}
