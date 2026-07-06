import {
  AUTO_ASSIGNABLE_SKILL_TIERS,
  assignmentBundleSchema,
  bereichFromLocationKind,
  type AssignmentBundle,
  type BundlePickupSequence,
  type GoodsReceiptCase,
  type Id,
  type ISODateTime,
  type LocationMaster,
  type PickupSequenceProfile,
} from '@paket/domain-types';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../config.js';
import { computeEffort } from '../effort/effort-score.js';
import { classifyPriority, sortByPriority } from '../priority/priority-engine.js';
import { teamCapacityMinutes } from '../capacity/net-capacity.js';
import { autoAssignableCapacityMinutes } from '../capacity/shift-end.js';
import { buildPickupSequence, type PickupCase } from '../pickup/pickup-order.js';
import type { AssignmentPlan, EngineInput, EnrichedCase, UnassignedCase } from '../types.js';
import { createBalancedBundles, type ProtoBundle } from './bundling.js';
import { distributeBundlesByWeightedLoad } from './distribute.js';
import {
  detectDeliveryGroups,
  indexDeliveryGroups,
  withheldCaseIds,
} from '../grouping/delivery-group.js';

/**
 * assignWork(date) — the §8.3 Zuteilungsalgorithmus (Teile-Modell, Teamlead-Feedback
 * C1–C6). Pure and deterministic so the Teamlead "Neu berechnen" / recalculate stays
 * reproducible and well under the Anhang E.5 budget of < 5 s for a typical day pool.
 *
 * Pipeline: enrich (priority + effort) → exclude → withhold delivery groups →
 * Monster-Belege zur manuellen TL-Entscheidung (C6) → Teile-dimensionierte
 * Starter-Packs (200–250 Teile) in priority/FIFO order → GENAU EIN Pack je
 * Mitarbeiter (weighted, no specialists) → Rest bleibt als `pool_remaining` im Pool
 * für den Self-Pull (C3) → pickup order inside each assigned pack.
 *
 * Minuten bleiben die interne Kapazitätswährung: jedes Pack wird über das
 * unveränderte Aufwandsmodell gegen die (Cutoff-effektiven) Netto-Schichtminuten
 * auf Machbarkeit geprüft.
 */

export interface AssignWorkOptions {
  avoidSpecialists?: boolean;
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
    priority: classifyPriority(goodsCase, {
      today: input.date,
      dailyShopAreas: config.priority.dailyShopAreas,
    }),
    teile: goodsCase.totalQuantity,
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

  // Skill-Stufen-Gate (Teamlead-Feedback A10): starter/dummy erhalten NUR manuell
  // zugeteilte Belege — ihre Schichten werden von der Auto-Verteilung ausgenommen
  // (Kapazität zählt nicht mit). Absent = profi (rückwärtsneutral).
  const autoShifts = input.shifts.filter((shift) =>
    AUTO_ASSIGNABLE_SKILL_TIERS.includes(shift.skillTier ?? 'profi'),
  );

  // Schichtende-Cutoff (ZIEL A, Punkt 5): the batch auto-distribution may only fill each
  // shift up to its cutoff point (plannedEnd − autoCutoffMinutes). We model this as an
  // effective shift whose netCapacityMinutes is the still-auto-assignable share at `now`,
  // then run the UNCHANGED capacity/bundling/distribution pipeline on it — so the
  // cutoff is honoured everywhere with no downstream change. With the engine default
  // (autoCutoffMinutes = 0) this is a no-op (effective === net). A shift that is fully
  // inside its cutoff window drops to 0 and falls out of distribution automatically.
  const effectiveShifts = autoShifts.map((shift) => {
    const effective = autoAssignableCapacityMinutes(shift, now, config.shiftEnd);
    return effective === shift.netCapacityMinutes
      ? shift
      : { ...shift, netCapacityMinutes: effective };
  });

  // A case's Bereich is FIXED by its Lagerplatz storage class (LocationKind), not a
  // free-text tag. The weighted distribution uses it to prefer matching specialists
  // and keep out-of-Bereich work off them (§8.4 routing).
  const kindByLocationCode = new Map(input.locations.map((l) => [l.code, l.kind]));
  const enriched = input.cases.map((c) => {
    const e = enrichCase(c, input, config);
    const kind = kindByLocationCode.get(c.storageLocation.code);
    e.bereich = kind ? bereichFromLocationKind(kind) : undefined;
    return e;
  });

  const unassigned: UnassignedCase[] = [];
  const preEligible: EnrichedCase[] = [];
  for (const e of enriched) {
    if (e.priority.rank === 0) {
      unassigned.push({ caseId: e.case.id, reason: 'excluded', priorityClass: e.priority.class });
    } else {
      preEligible.push(e);
    }
  }

  // Delivery-group detection (Teamlead-Anforderung Punkt 1) over the eligible pool. Done
  // up front so suspected (T3-only) groups can be WITHHELD from auto-distribution when
  // `autoDistributeSuspected` is off — they wait in the pool for a Teamlead confirm.
  const deliveryGroups = detectDeliveryGroups(
    preEligible.map((e) => ({
      id: e.case.id,
      weBelegNo: e.case.weBelegNo,
      deliveryNoteNo: e.case.deliveryNoteNo,
      deliverySourceGroupKey: e.case.deliverySourceGroupKey,
      deliverySourceGroupSize: e.case.deliverySourceGroupSize,
      manualDeliveryGroupKey: e.case.manualDeliveryGroupKey,
      bookingDate: e.case.bookingDate,
      section: e.case.section,
    })),
    config.grouping,
  );
  const withheld = withheldCaseIds(deliveryGroups, config.grouping);
  const eligible: EnrichedCase[] = [];
  for (const e of preEligible) {
    if (withheld.has(e.case.id)) {
      unassigned.push({
        caseId: e.case.id,
        reason: 'delivery_unconfirmed',
        priorityClass: e.priority.class,
      });
    } else {
      eligible.push(e);
    }
  }
  const { groupIdByCaseId } = indexDeliveryGroups(deliveryGroups);

  // Monster-Belege (C6): über der Teile-Schwelle wird NICHT auto-verteilt — der Beleg
  // bleibt als `large_beleg` markiert im Pool und wartet auf die manuelle TL-Entscheidung.
  const packable: EnrichedCase[] = [];
  for (const e of eligible) {
    if (e.teile >= config.assignment.largeBelegTeileThreshold) {
      unassigned.push({
        caseId: e.case.id,
        reason: 'large_beleg',
        priorityClass: e.priority.class,
      });
    } else {
      packable.push(e);
    }
  }

  // Capacity (§4.3) — over the cutoff-effective shifts (minutes feasibility budget).
  const totalCapacity = teamCapacityMinutes(effectiveShifts);

  // Starter-Packs (C1/C3): Fortsetzungen aus Vortagen zuerst, dann der heutige Pool,
  // beides in Prioritäts-/FIFO-Ordnung — die wichtigsten Belege landen in den ersten
  // Packs, und der erste angemeldete Mitarbeiter erhält das erste Pack.
  const ordered = [
    ...sortByPriority(packable.filter((e) => e.fromPreviousDays)),
    ...sortByPriority(packable.filter((e) => !e.fromPreviousDays)),
  ];
  const packing = createBalancedBundles(ordered, totalCapacity, config.assignment, 'starter', {
    groupIdByCaseId,
  });
  const protoBundles: ProtoBundle[] = packing.bundles;
  const starterMinutes = sumEffort(protoBundles);

  // Ein Starter-Pack je Mitarbeiter (§8.3/§8.4) mit soft delivery-group affinity, über
  // die Schichtende-cutoff-effektiven Schichten (Punkt 5). Übrige Packs bleiben im Pool.
  const distribution = distributeBundlesByWeightedLoad(effectiveShifts, protoBundles, input.date, {
    avoidSpecialists: options.avoidSpecialists ?? true,
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

  // Cases beyond the minutes budget did not fit anywhere today.
  for (const e of packing.overflow) {
    unassigned.push({ caseId: e.case.id, reason: 'no_capacity', priorityClass: e.priority.class });
  }
  // Packs ohne freien Mitarbeiter bleiben bewusst im Pool: der Self-Pull zieht sie
  // als Folge-Packs (C3) — kein Kapazitätsproblem, sondern das gewollte Modell.
  for (const proto of distribution.unassigned) {
    for (const e of proto.cases) {
      unassigned.push({
        caseId: e.case.id,
        reason: 'pool_remaining',
        priorityClass: e.priority.class,
      });
    }
  }

  const assignedMinutes = bundles.reduce((sum, b) => sum + b.plannedEffortMinutes, 0);

  return {
    date: input.date,
    bundles,
    pickupSequences,
    unassigned,
    loads: distribution.loads,
    diagnostics: {
      totalCapacityMinutes: totalCapacity,
      starterMinutes: Math.round(starterMinutes * 100) / 100,
      assignedMinutes: Math.round(assignedMinutes * 100) / 100,
      excludedCaseCount: unassigned.filter((u) => u.reason === 'excluded').length,
    },
  };
}
