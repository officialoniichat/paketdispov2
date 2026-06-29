/**
 * View-model types for the Teamlead cockpit (§10/§11, Anhang E.4).
 *
 * These are UI/projection shapes the cockpit components render. The live data
 * layer (see {@link ./remoteDataset}, {@link ./belege}) populates them from the
 * @paket/api-client read endpoints, mapping each DTO field-by-field so the
 * feature components stay free of transport concerns.
 */
import type { GoodsReceiptCase, WorkIssue } from '@paket/domain-types';

// ---------------------------------------------------------------------------
// §10.1 Tagescockpit
// ---------------------------------------------------------------------------

/** Capacity figures shown at the top of the cockpit (§10.1). */
export interface CapacitySummary {
  plannedEmployees: number;
  netCapacityMinutes: number;
  plannedMinutes: number;
  reserveMinutes: number;
  utilisationPct: number;
}

/** Open-pool counters (§10.1: Offen / Überfällig / Prio / CatMan / Probleme). */
export interface PoolSummary {
  openCases: number;
  overdue: number;
  prio: number;
  catManDue: number;
  openIssues: number;
  /** Punkt 6: non-terminal Belege whose assigned employee's shift has already ended. */
  endOfShiftOpen: number;
}

/** ZST progress for the day (§10.1 ZST-Fortschritt, §15). */
export interface ZstProgress {
  completedCases: number;
  totalCases: number;
  completedParts: number;
  effortPoints: number;
  partsPerHour: number;
  effortPointsPerHour: number;
}

export interface CockpitSummary {
  date: string;
  capacity: CapacitySummary;
  pool: PoolSummary;
  zst: ZstProgress;
}

// ---------------------------------------------------------------------------
// §10.2 Digitale Ablagen (Kanban / Queue-Lanes)
// ---------------------------------------------------------------------------

export type LaneId =
  | 'prio'
  | 'jeden_tag'
  | 'verladeplan_heute'
  | 'verladeplan_morgen'
  | 'reserve'
  | 'geparkt'
  | 'probleme';

/** One card in a lane – a case projection plus its lane-relevant flags. */
export interface LaneCard {
  caseId: string;
  weBelegNo: string;
  status: GoodsReceiptCase['status'];
  section: GoodsReceiptCase['section'];
  goodsTypeText?: GoodsReceiptCase['goodsTypeText'];
  priorityFlags: GoodsReceiptCase['priorityFlags'];
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
  storageCode: string;
  assignedTo?: string;
  issueStatus?: WorkIssue['status'];
}

export interface Lane {
  id: LaneId;
  title: string;
  description: string;
  cards: LaneCard[];
  totalEffortMinutes: number;
}

// ---------------------------------------------------------------------------
// §10.3 Mitarbeitenden-Board (workforce dispatch)
// ---------------------------------------------------------------------------

/** One case in an employee's bundle, in pickup order (§10.3 board detail). */
export interface BoardCase {
  caseId: string;
  weBelegNo: string;
  status: GoodsReceiptCase['status'];
  estimatedMinutes: number;
  effortPoints: number;
  storageCode: string;
  /** Delivery-group id (Teamlead-Anforderung Punkt 1); null/undefined if standalone. */
  deliveryGroupId?: string | null;
  /** Belege in this case's delivery group (1 = standalone). */
  deliveryGroupSize?: number;
}

export interface BoardRow {
  employeeId: string;
  displayName: string;
  plannedHours: number;
  utilisationPct: number;
  assignedMinutes: number;
  netCapacityMinutes: number;
  effortPoints: number;
  heavyCaseCount: number;
  lightCaseCount: number;
  openIssues: number;
  currentCaseIndex?: number;
  bundleSize?: number;
  bundleId?: string;
  paused: boolean;
  /** Fixed Bereiche/skills of the employee (shown on idle rows too). */
  bereiche: string[];
  /** Cases assigned to this bundle, in pickup order (manual-intervention source). */
  cases: BoardCase[];
}

/** A free (ready, unassigned) case available to add to a bundle (§10.3). */
export interface PoolCase {
  caseId: string;
  weBelegNo: string;
  estimatedMinutes: number;
}

// ---------------------------------------------------------------------------
// §E.4 Simulation „Neu berechnen" (engine dry-run preview, real backend)
// ---------------------------------------------------------------------------

/** Per-employee load the engine proposes (mirrors EmployeeLoadDto). */
export interface PreviewEmployeeLoad {
  employeeId: string;
  capacityMinutes: number;
  assignedMinutes: number;
  assignedPoints: number;
  bundleCount: number;
}

/**
 * Non-committal preview of an assignment-engine run (mirrors RecalculateResultDto).
 * Produced by `/assignments/preview`; persists nothing until committed via
 * `/assignments/recalculate`.
 */
export interface PreviewResult {
  date: string;
  bundleCount: number;
  assignedCaseCount: number;
  unassignedCaseCount: number;
  reserveMinutes: number;
  durationMs: number;
  loads: PreviewEmployeeLoad[];
}

