import {
  assignmentBundleSchema,
  type AssignmentBundle,
  type BundlePickupSequence,
  type GoodsReceiptCase,
  type Id,
  type ISODateTime,
  type LocationMaster,
  type PickupSequenceProfile,
  type PriorityFlag,
} from '@paket/domain-types';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../config.js';
import { computeEffort } from '../effort/effort-score.js';
import { classifyPriority, sortByPriority } from '../priority/priority-engine.js';
import { teamCapacityMinutes } from '../capacity/net-capacity.js';
import { buildPickupSequence, type PickupCase } from '../pickup/pickup-order.js';
import type { AssignmentPlan, EngineInput, EnrichedCase, UnassignedCase } from '../types.js';
import { canConsumeReserve, computeIronReserve } from './reserve.js';
import { createBalancedBundles, type ProtoBundle } from './bundling.js';
import { distributeBundlesByWeightedLoad } from './distribute.js';

/**
 * assignWork(date) — the §8.3 Zuteilungsalgorithmus. Pure and deterministic so the
 * Teamlead "Neu berechnen" / recalculate stays reproducible and well under the
 * Anhang E.5 budget of < 5 s for a typical day pool.
 *
 * Pipeline: enrich (priority + effort) → exclude → capacity → reserve → starter
 * packages → balanced bundles (Prio may break the reserve) → weighted distribution
 * (no specialists, heavy/light mix) → pickup order inside each finished bundle.
 */

export interface AssignWorkOptions {
  avoidSpecialists?: boolean;
  balanceHeavyLight?: boolean;
  /** Timestamp stamped onto pickup sequences (deterministic when supplied). */
  now?: ISODateTime;
}

function enrichCase(
  goodsCase: GoodsReceiptCase,
  input: EngineInput,
  config: EngineConfig,
): EnrichedCase {
  const vector = input.effortVectors?.get(goodsCase.id);
  const effort = vector
    ? computeEffort(vector, config.effort)
    : { minutes: goodsCase.estimatedMinutes, points: goodsCase.effortPoints };
  return {
    case: goodsCase,
    priority: classifyPriority(goodsCase, { today: input.date }),
    effortMinutes: effort.minutes,
    effortPoints: effort.points,
    wgrCodes: vector ? vector.wgrCodes : [],
    fromPreviousDays:
      goodsCase.bookingDate < input.date || goodsCase.status === 'partially_completed',
  };
}

function sumEffort(bundles: readonly ProtoBundle[]): number {
  return bundles.reduce((sum, b) => sum + b.effortMinutes, 0);
}

function resolvePickup(
  bundle: AssignmentBundle,
  caseById: ReadonlyMap<Id, GoodsReceiptCase>,
  workstationByEmployee: ReadonlyMap<Id, string | undefined>,
  profileByStart: ReadonlyMap<string, PickupSequenceProfile>,
  locationByCode: ReadonlyMap<string, LocationMaster>,
  now: ISODateTime,
): BundlePickupSequence {
  const startLocationId = workstationByEmployee.get(bundle.employeeId) ?? `ws-${bundle.employeeId}`;
  const profile = profileByStart.get(startLocationId);
  const pickupCases: PickupCase[] = bundle.caseIds.map((id) => ({
    caseId: id,
    location: caseById.get(id)!.storageLocation,
  }));
  return buildPickupSequence(bundle.id, bundle.employeeId, startLocationId, pickupCases, {
    mode: profile?.mode ?? 'numeric_fallback',
    orderedLocationIds: profile?.orderedLocationIds,
    locationMaster: locationByCode,
    calculatedAt: now,
  });
}

export function assignWork(
  input: EngineInput,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
  options: AssignWorkOptions = {},
): AssignmentPlan {
  const now = options.now ?? new Date().toISOString();
  // Resolve each case's Bereich from its Lagerplatz (LocationMaster.bereich) so the
  // weighted distribution can prefer matching specialists (§8.4 routing).
  const bereichByLocationCode = new Map(input.locations.map((l) => [l.code, l.bereich]));
  const enriched = input.cases.map((c) => {
    const e = enrichCase(c, input, config);
    e.bereich = bereichByLocationCode.get(c.storageLocation.code) ?? undefined;
    return e;
  });

  const unassigned: UnassignedCase[] = [];
  const eligible: EnrichedCase[] = [];
  for (const e of enriched) {
    if (e.priority.rank === 0) {
      unassigned.push({ caseId: e.case.id, reason: 'excluded', priorityClass: e.priority.class });
    } else {
      eligible.push(e);
    }
  }

  // Capacity (§4.3) and reserve (B.2).
  const totalCapacity = teamCapacityMinutes(input.shifts);
  const activeEmployeeCount = input.shifts.filter(
    (s) => s.active && s.netCapacityMinutes > 0,
  ).length;
  const morningCapacity = totalCapacity * config.capacity.morningCapacityFraction;
  const reserve = computeIronReserve({
    plannedEmployeeCount: activeEmployeeCount,
    nextMorningCapacityMinutes: input.nextMorningCapacityMinutes ?? totalCapacity,
    config: config.reserve,
  });

  // Starter packages from previous days, filled first against the morning capacity.
  const starterCandidates = sortByPriority(eligible.filter((e) => e.fromPreviousDays));
  const todayCandidates = eligible.filter((e) => !e.fromPreviousDays);
  const starter = createBalancedBundles(
    starterCandidates,
    morningCapacity,
    config.assignment,
    'starter',
  );
  const starterMinutes = sumEffort(starter.bundles);

  const capacityAfterStarter = Math.max(0, totalCapacity - starterMinutes);

  // Prio/CatMan/overdue/manual cases may break the reserve; everything else respects it.
  const overrideCandidates = sortByPriority(
    todayCandidates.filter((e) => canConsumeReserve(e.case.priorityFlags, config.reserve)),
  );
  const normalCandidates = sortByPriority(
    todayCandidates.filter((e) => !canConsumeReserve(e.case.priorityFlags, config.reserve)),
  );

  const override = createBalancedBundles(
    overrideCandidates,
    capacityAfterStarter,
    config.assignment,
  );
  const overrideMinutes = sumEffort(override.bundles);
  const normalBudget = Math.max(0, capacityAfterStarter - overrideMinutes - reserve.minutes);
  const normal = createBalancedBundles(normalCandidates, normalBudget, config.assignment);

  const protoBundles: ProtoBundle[] = [...starter.bundles, ...override.bundles, ...normal.bundles];

  // Weighted distribution (§8.3/§8.4).
  const distribution = distributeBundlesByWeightedLoad(input.shifts, protoBundles, input.date, {
    avoidSpecialists: options.avoidSpecialists ?? true,
    balanceHeavyLight: options.balanceHeavyLight ?? true,
  });

  // Pickup order INSIDE each finished bundle (§D.3). Never feeds back into distribution.
  const caseById = new Map<Id, GoodsReceiptCase>(input.cases.map((c) => [c.id, c]));
  const workstationByEmployee = new Map<Id, string | undefined>(
    input.shifts.map((s) => [s.employeeId, s.workstationId]),
  );
  const profileByStart = new Map<string, PickupSequenceProfile>();
  for (const p of input.pickupProfiles ?? []) {
    if (p.active) profileByStart.set(p.startLocationId, p);
  }
  const locationByCode = new Map<string, LocationMaster>(input.locations.map((l) => [l.code, l]));

  const pickupSequences: BundlePickupSequence[] = [];
  const bundles: AssignmentBundle[] = distribution.bundles.map((bundle) => {
    const sequence = resolvePickup(
      bundle,
      caseById,
      workstationByEmployee,
      profileByStart,
      locationByCode,
      now,
    );
    pickupSequences.push(sequence);
    return assignmentBundleSchema.parse({ ...bundle, route: sequence.stops });
  });

  // Cases that did not fit anywhere.
  for (const e of [...starter.overflow, ...override.overflow, ...normal.overflow]) {
    unassigned.push({ caseId: e.case.id, reason: 'no_capacity', priorityClass: e.priority.class });
  }
  for (const proto of distribution.unassigned) {
    for (const e of proto.cases) {
      unassigned.push({
        caseId: e.case.id,
        reason: 'no_capacity',
        priorityClass: e.priority.class,
      });
    }
  }

  const assignedMinutes = bundles.reduce((sum, b) => sum + b.plannedEffortMinutes, 0);
  const consumingFlags = new Set<PriorityFlag>();
  for (const e of overrideCandidates) {
    for (const flag of e.case.priorityFlags) {
      if (config.reserve.overrideAllowedFor.includes(flag)) consumingFlags.add(flag);
    }
  }

  return {
    date: input.date,
    bundles,
    pickupSequences,
    reserve,
    unassigned,
    loads: distribution.loads,
    diagnostics: {
      totalCapacityMinutes: totalCapacity,
      starterMinutes: Math.round(starterMinutes * 100) / 100,
      assignedMinutes: Math.round(assignedMinutes * 100) / 100,
      reserveMinutes: reserve.minutes,
      excludedCaseCount: unassigned.filter((u) => u.reason === 'excluded').length,
      priorityFlagsConsumingReserve: [...consumingFlags],
    },
  };
}
