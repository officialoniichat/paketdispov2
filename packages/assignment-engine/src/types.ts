import type {
  AssignmentBundle,
  BundlePickupSequence,
  EffortInputVector,
  EmployeeShift,
  GoodsReceiptCase,
  ISODate,
  Id,
  LocationMaster,
  PickupSequenceProfile,
  PriorityFlag,
} from '@paket/domain-types';

/** Priority class ranks (§8.1). Lower rank = processed earlier. Rank 0 is excluded. */
export const PRIORITY_RANK = {
  exclusion: 0,
  manualTeamlead: 1,
  prioFlag: 2,
  catManDue: 3,
  everyDay: 4,
  loadPlanDue: 5,
  fifo: 6,
} as const;

export type PriorityRank = (typeof PRIORITY_RANK)[keyof typeof PRIORITY_RANK];

export type PriorityClass =
  | 'exclusion'
  | 'manual_teamlead'
  | 'prio_flag'
  | 'catman_due'
  | 'every_day'
  | 'load_plan_due'
  | 'fifo';

/** Result of classifying one case against §8.1. */
export interface PriorityClassification {
  rank: PriorityRank;
  class: PriorityClass;
  /** Human-readable reason, surfaced in Teamlead simulation diff. */
  reason: string;
}

/** A pool case enriched with its computed priority + effort (the engine's working unit). */
export interface EnrichedCase {
  case: GoodsReceiptCase;
  priority: PriorityClassification;
  effortMinutes: number;
  effortPoints: number;
  /** Warengruppen codes for the case (specialist-avoidance signal, §8.4). Empty if unknown. */
  wgrCodes: string[];
  /** Fixed Bereich/Skill of the case, derived from its Lagerplatz storage class (LocationKind). */
  bereich?: string;
  /** True when the case originates from previous days (starter-package candidate). */
  fromPreviousDays: boolean;
}

/** Inputs to a single assignment run for one planning date. */
export interface EngineInput {
  date: ISODate;
  /** Ready pool cases (validated upstream from ProHandel). */
  cases: GoodsReceiptCase[];
  /** Planned shifts for the day (derived from SEAK/PEP — capacity module). */
  shifts: EmployeeShift[];
  /** Location master for pickup-order resolution (Anhang D). */
  locations: LocationMaster[];
  /** Optional per-workstation pickup-order profiles (Anhang D). */
  pickupProfiles?: PickupSequenceProfile[];
  /**
   * Optional effort vectors per case (§8.2). When provided, effort is recomputed from
   * the vector (and yields the Warengruppen signal for specialist-avoidance); otherwise
   * the case's pre-computed `estimatedMinutes`/`effortPoints` are used as-is.
   */
  effortVectors?: ReadonlyMap<Id, EffortInputVector>;
  /**
   * Next morning's planned team capacity in minutes, used for the eiserne Reserve
   * (B.2). When absent, the engine falls back to today's total capacity.
   */
  nextMorningCapacityMinutes?: number;
}

/** A case that could not be placed, with the reason (surfaced to Teamlead). */
export interface UnassignedCase {
  caseId: Id;
  reason: 'excluded' | 'no_capacity' | 'held_in_reserve';
  priorityClass: PriorityClass;
}

/** Computed reserve outcome (B.2). */
export interface ReserveResult {
  minutes: number;
  byPercentage: number;
  byMinimumPerEmployee: number;
}

/** Per-employee load summary for fairness diagnostics (§8.4). */
export interface EmployeeLoad {
  employeeId: Id;
  capacityMinutes: number;
  assignedMinutes: number;
  assignedPoints: number;
  bundleCount: number;
  /** Distinct Warengruppen across assigned bundles — proxy for "no specialists". */
  distinctWgrCount: number;
}

/** Full output of an assignment run (§8.3 AssignmentPlan). */
export interface AssignmentPlan {
  date: ISODate;
  bundles: AssignmentBundle[];
  pickupSequences: BundlePickupSequence[];
  reserve: ReserveResult;
  unassigned: UnassignedCase[];
  loads: EmployeeLoad[];
  /** Total capacity and how it was spent — for the Teamlead "Neu berechnen" delta. */
  diagnostics: {
    totalCapacityMinutes: number;
    starterMinutes: number;
    assignedMinutes: number;
    reserveMinutes: number;
    excludedCaseCount: number;
    priorityFlagsConsumingReserve: PriorityFlag[];
  };
}
