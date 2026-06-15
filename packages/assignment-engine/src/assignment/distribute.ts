import {
  assignmentBundleSchema,
  type AssignmentBundle,
  type EmployeeShift,
  type ISODate,
} from '@paket/domain-types';
import type { EmployeeLoad } from '../types.js';
import type { ProtoBundle } from './bundling.js';

/**
 * distributeBundlesByWeightedLoad (§8.3 / §8.4). Assign bundles to employees so the
 * load (relative to each person's net capacity) stays balanced, while:
 *   - avoidSpecialists: discouraging concentration of one Warengruppe on one person
 *     (keine dauerhafte Warengruppen-Spezialisierung),
 *   - balanceHeavyLight: spreading heavy bundles so each shift gets a heavy/light mix.
 * Largest-effort-first (LPT) assignment with deterministic tie-breaks.
 */

const SPECIALIST_PENALTY = 0.05;
const HEAVY_PENALTY = 0.03;
const EPSILON = 1e-9;

export interface DistributeOptions {
  avoidSpecialists?: boolean;
  balanceHeavyLight?: boolean;
}

export interface DistributionResult {
  bundles: AssignmentBundle[];
  loads: EmployeeLoad[];
  /** Bundles that could not be assigned (no active employee with capacity). */
  unassigned: ProtoBundle[];
}

interface EmployeeState {
  shift: EmployeeShift;
  assignedMinutes: number;
  assignedPoints: number;
  bundleCount: number;
  heavyCount: number;
  wgrCounts: Map<string, number>;
}

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

export function distributeBundlesByWeightedLoad(
  shifts: readonly EmployeeShift[],
  protoBundles: readonly ProtoBundle[],
  date: ISODate,
  options: DistributeOptions = {},
): DistributionResult {
  const avoidSpecialists = options.avoidSpecialists ?? true;
  const balanceHeavyLight = options.balanceHeavyLight ?? true;

  const states: EmployeeState[] = shifts
    .filter((s) => s.active && s.netCapacityMinutes > 0)
    .map((shift) => ({
      shift,
      assignedMinutes: 0,
      assignedPoints: 0,
      bundleCount: 0,
      heavyCount: 0,
      wgrCounts: new Map<string, number>(),
    }));

  // Stable bundle id per proto by creation order (deterministic recalculation).
  const idByProto = new Map<ProtoBundle, string>();
  protoBundles.forEach((proto, index) => idByProto.set(proto, `bundle-${date}-${pad(index)}`));

  if (states.length === 0) {
    return { bundles: [], loads: [], unassigned: [...protoBundles] };
  }

  const order = [...protoBundles].sort(
    (a, b) =>
      b.effortMinutes - a.effortMinutes || idByProto.get(a)!.localeCompare(idByProto.get(b)!),
  );

  const bundles: AssignmentBundle[] = [];

  for (const proto of order) {
    let best: EmployeeState | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const st of states) {
      const ratio = (st.assignedMinutes + proto.effortMinutes) / st.shift.netCapacityMinutes;
      const specialist =
        avoidSpecialists && proto.dominantWgr
          ? (st.wgrCounts.get(proto.dominantWgr) ?? 0) * SPECIALIST_PENALTY
          : 0;
      const heavy = balanceHeavyLight && proto.containsHeavy ? st.heavyCount * HEAVY_PENALTY : 0;
      const score = ratio + specialist + heavy;

      const isBetter = score < bestScore - EPSILON;
      const isTie = Math.abs(score - bestScore) <= EPSILON;
      if (best === undefined || isBetter || (isTie && st.shift.employeeId < best.shift.employeeId)) {
        best = st;
        bestScore = score;
      }
    }

    const chosen = best!;
    chosen.assignedMinutes += proto.effortMinutes;
    chosen.assignedPoints += proto.effortPoints;
    chosen.bundleCount += 1;
    if (proto.containsHeavy) chosen.heavyCount += 1;
    for (const c of proto.cases) {
      for (const wgr of c.wgrCodes) {
        chosen.wgrCounts.set(wgr, (chosen.wgrCounts.get(wgr) ?? 0) + 1);
      }
    }

    bundles.push(
      assignmentBundleSchema.parse({
        id: idByProto.get(proto)!,
        employeeId: chosen.shift.employeeId,
        date,
        caseIds: proto.caseIds,
        plannedEffortMinutes: proto.effortMinutes,
        effortPoints: proto.effortPoints,
        route: [],
        status: 'created',
        createdBy: 'system',
      }),
    );
  }

  bundles.sort((a, b) => a.id.localeCompare(b.id));

  const loads: EmployeeLoad[] = states.map((st) => ({
    employeeId: st.shift.employeeId,
    capacityMinutes: st.shift.netCapacityMinutes,
    assignedMinutes: Math.round(st.assignedMinutes * 100) / 100,
    assignedPoints: Math.round(st.assignedPoints * 100) / 100,
    bundleCount: st.bundleCount,
    distinctWgrCount: st.wgrCounts.size,
  }));

  return { bundles, loads, unassigned: [] };
}
