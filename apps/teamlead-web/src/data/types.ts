/**
 * View-model types for the Teamlead cockpit (§10/§11, Anhang E.4).
 *
 * These are UI/projection shapes the cockpit components render. The live data
 * layer (see {@link ./remoteDataset}, {@link ./belege}) populates them from the
 * @paket/api-client read endpoints, mapping each DTO field-by-field so the
 * feature components stay free of transport concerns.
 */
import type { GoodsReceiptCase, SkillTier, WorkIssue } from '@paket/domain-types';

// ---------------------------------------------------------------------------
// §10.1 Tagescockpit
// ---------------------------------------------------------------------------

/** Capacity figures shown at the top of the cockpit (§10.1). */
export interface CapacitySummary {
  plannedEmployees: number;
  netCapacityMinutes: number;
  plannedMinutes: number;
  /** net − planned; negative = overbooked (cockpit „Überbucht" exception). */
  freeCapacityMinutes: number;
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
  | 'sonstige'
  | 'geparkt'
  | 'weitergeleitet'
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
  /** C4: latest OPEN problem (kind + note preview); null without an open issue. */
  openIssue: { kind: string; note: string | null } | null;
  /** C5: Weiterleitungs-Empfänger; null = nicht weitergeleitet. */
  forwardedTo: string | null;
  /** Fester Bereich des Belegs (Zuweisen-Dialog, weiche Warnung). */
  bereich: string | null;
  /** TL-Topf (A7): „Besondere Aufmerksamkeit". */
  attentionFlag: boolean;
  attentionNote: string | null;
  /** „Gehört zusammen"-Lieferung; null für Einzel-Belege (A1). */
  deliveryGroup: DeliveryGroupRef | null;
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

/** Per-case Lieferung context (Teamlead-Punkt 1) shared by Board, Pool and Detail. */
export interface DeliveryGroupRef {
  id: string;
  signal: 'source' | 'note' | 'run' | 'manual' | 'mixed';
  confidence: 'confirmed' | 'likely' | 'suspected' | 'locked';
  presentSize: number;
  expectedSize?: number | null;
  missingCount: number;
  locked: boolean;
  /** D2 „trotzdem bearbeiten": TL hat die unvollständige Lieferung freigegeben. */
  released: boolean;
}

/** One case in an employee's bundle, in pickup order (§10.3 board detail). */
export interface BoardCase {
  caseId: string;
  weBelegNo: string;
  status: GoodsReceiptCase['status'];
  /** Teile of the Beleg — the primary size display (B3). */
  totalQuantity: number;
  estimatedMinutes: number;
  effortPoints: number;
  storageCode: string;
  /** Delivery-group context (Teamlead-Anforderung Punkt 1); null if standalone. */
  deliveryGroup?: DeliveryGroupRef | null;
}

export interface BoardRow {
  employeeId: string;
  displayName: string;
  /** Skill-Stufe (B5); starter/dummy erhalten nur manuelle Zuteilung. */
  skillTier: SkillTier;
  /** Σ Teile über die zugeteilten Belege — primäre Last-Anzeige (B3). */
  plannedTeile: number;
  plannedHours: number;
  utilisationPct: number;
  assignedMinutes: number;
  netCapacityMinutes: number;
  effortPoints: number;
  openIssues: number;
  currentCaseIndex?: number;
  bundleSize?: number;
  bundleId?: string;
  /** AssignmentStatus of the current Bündel (created/assigned/accepted/active/paused/…); undefined if free. */
  bundleStatus?: string;
  paused: boolean;
  /** Fixed Bereiche/skills of the employee (shown on idle rows too). */
  bereiche: string[];
  /** Cases assigned to this bundle, in pickup order (manual-intervention source). */
  cases: BoardCase[];
}

/** A free (ready, unassigned) case available to assign to an employee (§10.3). */
export interface PoolCase {
  caseId: string;
  weBelegNo: string;
  /** Fixed Bereich of the Beleg (Hängebahn/Palette/Regal); drives the soft skill warning. */
  bereich?: string;
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
  durationMs: number;
  loads: PreviewEmployeeLoad[];
}

