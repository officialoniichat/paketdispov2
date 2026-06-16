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
 *
 * The LPT loop still decides per proto-bundle which employee receives it (fairness
 * and determinism are unchanged). Afterwards every proto-bundle that landed on the
 * same employee is MERGED into a single AssignmentBundle: one bundle = one employee's
 * day plan. caseIds are concatenated in proto-assignment order, effort is summed, and
 * the bundle gets one stable id (`bundle-<date>-<employeeIndex>`). The whole cockpit
 * (board row, withdraw/add/reorder/pause/resume, the "Paket x/y" counter, §10.3) keys
 * off exactly one bundle per employee, so the engine emits exactly that.
 */

const SPECIALIST_PENALTY = 0.05;
const HEAVY_PENALTY = 0.03;
/** Soft penalty per case whose Bereich a (non-Allrounder) employee does not handle. */
const BEREICH_PENALTY = 0.04;
const EPSILON = 1e-9;

/**
 * Soft Bereich/Skill mismatch cost for assigning `proto` to an employee with the
 * given `bereiche`. Allrounder (empty/undefined) → 0 (handles anything). Otherwise
 * each case whose Bereich is set and not handled adds a penalty — preferring
 * specialists without ever blocking work (everyone equal ⇒ load decides).
 */
function bereichMismatchPenalty(bereiche: readonly string[] | undefined, proto: ProtoBundle): number {
  if (!bereiche || bereiche.length === 0) return 0;
  const handled = new Set(bereiche);
  let mismatches = 0;
  for (const c of proto.cases) {
    if (c.bereich && !handled.has(c.bereich)) mismatches += 1;
  }
  return mismatches * BEREICH_PENALTY;
}

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
  /** Stable distribution order index of this employee (drives the merged bundle id). */
  index: number;
  assignedMinutes: number;
  assignedPoints: number;
  bundleCount: number;
  heavyCount: number;
  wgrCounts: Map<string, number>;
  /** Proto-bundles assigned to this employee, in LPT-assignment order (for the merge). */
  assignedProtos: ProtoBundle[];
}

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
    .map((shift, index) => ({
      shift,
      index,
      assignedMinutes: 0,
      assignedPoints: 0,
      bundleCount: 0,
      heavyCount: 0,
      wgrCounts: new Map<string, number>(),
      assignedProtos: [],
    }));

  // Stable proto ordering key by creation order (deterministic recalculation).
  const idByProto = new Map<ProtoBundle, string>();
  protoBundles.forEach((proto, index) => idByProto.set(proto, `proto-${date}-${pad(index)}`));

  if (states.length === 0) {
    return { bundles: [], loads: [], unassigned: [...protoBundles] };
  }

  const order = [...protoBundles].sort(
    (a, b) =>
      b.effortMinutes - a.effortMinutes || idByProto.get(a)!.localeCompare(idByProto.get(b)!),
  );

  // LPT assignment (fairness + specialist/heavy balancing) — decides which employee
  // owns each proto-bundle. Unchanged from before; only the emitted shape differs.
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
      const bereich = bereichMismatchPenalty(st.shift.bereiche, proto);
      const score = ratio + specialist + heavy + bereich;

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
    if (proto.containsHeavy) chosen.heavyCount += 1;
    for (const c of proto.cases) {
      for (const wgr of c.wgrCodes) {
        chosen.wgrCounts.set(wgr, (chosen.wgrCounts.get(wgr) ?? 0) + 1);
      }
    }
    chosen.assignedProtos.push(proto);
  }

  // Merge: one AssignmentBundle per employee with work. caseIds are concatenated in
  // proto-assignment order (priority/FIFO preserved within each proto), effort summed,
  // and one stable id `bundle-<date>-<employeeIndex>` per person. Pickup order is
  // recomputed over the merged case list downstream in plan.ts (route stays []).
  const bundles: AssignmentBundle[] = [];
  for (const st of states) {
    if (st.assignedProtos.length === 0) continue;
    st.bundleCount = 1;
    const caseIds = st.assignedProtos.flatMap((p) => p.caseIds);
    const plannedEffortMinutes = round2(
      st.assignedProtos.reduce((sum, p) => sum + p.effortMinutes, 0),
    );
    const effortPoints = round2(st.assignedProtos.reduce((sum, p) => sum + p.effortPoints, 0));
    bundles.push(
      assignmentBundleSchema.parse({
        id: `bundle-${date}-${pad(st.index)}`,
        employeeId: st.shift.employeeId,
        date,
        caseIds,
        plannedEffortMinutes,
        effortPoints,
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
    assignedMinutes: round2(st.assignedMinutes),
    assignedPoints: round2(st.assignedPoints),
    bundleCount: st.bundleCount,
    distinctWgrCount: st.wgrCounts.size,
  }));

  return { bundles, loads, unassigned: [] };
}
