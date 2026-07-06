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
} from '@paket/domain-types';

/**
 * Priority class ranks (§8.1, Leiter nach Teamlead-Feedback B2). Lower rank =
 * processed earlier. Rank 0 is excluded.
 */
export const PRIORITY_RANK = {
  exclusion: 0,
  manualTeamlead: 1,
  prioFlag: 2,
  /** TIER 1: Jeden-Tag-Abschnitte 7/4/8 + tägliche Shopbereiche (120/90). */
  dailyLoading: 3,
  /** TIER 2: NOS + Hängeware. */
  nosHaengeware: 4,
  /** TIER 3: Verladeplan-Abschnitte 1/2/3, fällig ab Verladetag. */
  loadPlanDue: 5,
  fifo: 6,
} as const;

export type PriorityRank = (typeof PRIORITY_RANK)[keyof typeof PRIORITY_RANK];

export type PriorityClass =
  | 'exclusion'
  | 'manual_teamlead'
  | 'prio_flag'
  | 'daily_loading'
  | 'nos_haengeware'
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
  /** Teile (Stückzahl) des Belegs — die Bündel-Dimensionierungs-Einheit (C1). */
  teile: number;
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
}

/** A case that could not be placed, with the reason (surfaced to Teamlead). */
export interface UnassignedCase {
  caseId: Id;
  /**
   * - excluded: status not eligible.
   * - no_capacity: no shift could take the case within its minutes budget.
   * - delivery_unconfirmed: withheld member of an unconfirmed delivery group.
   * - pool_remaining: bewusst im Pool gelassen — die Batch-Verteilung legt nur
   *   Starter-Packs; den Rest ziehen die Mitarbeiter per Self-Pull (C3).
   * - large_beleg: Monster-Beleg über der Teile-Schwelle → manuelle TL-Entscheidung (C6).
   */
  reason: 'excluded' | 'no_capacity' | 'delivery_unconfirmed' | 'pool_remaining' | 'large_beleg';
  priorityClass: PriorityClass;
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
  unassigned: UnassignedCase[];
  loads: EmployeeLoad[];
  /** Total capacity and how it was spent — for the Teamlead "Neu berechnen" delta. */
  diagnostics: {
    totalCapacityMinutes: number;
    starterMinutes: number;
    assignedMinutes: number;
    excludedCaseCount: number;
  };
}
