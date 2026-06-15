/**
 * View-model types for the Teamlead cockpit (§10/§11, Anhang E.4).
 *
 * These are UI/projection shapes derived from the @paket/domain-types entities.
 * Selectors in `selectors.ts` compute them from the (currently mocked) dataset;
 * once EPIC 3/6 ships the read APIs, the same shapes are populated from
 * @paket/api-client without touching the feature components.
 */
import type {
  AssignmentBundle,
  EmployeeShift,
  GoodsReceiptCase,
  KpiSnapshot,
  LocationMaster,
  ReceiptPosition,
  TransportBox,
  WorkIssue,
  WorkflowEvent,
} from '@paket/domain-types';

/** A warehouse employee (Anhang A Employee – minimal projection for the board). */
export interface Employee {
  id: string;
  displayName: string;
  workstationCode?: string;
}

/** Original document reference shown in Belegdetails (§10.4 Originaldokumente). */
export interface DocumentRef {
  id: string;
  caseId: string;
  kind: 'work_instruction' | 'goods_receipt' | 'delivery_note';
  fileName: string;
  url: string;
}

/**
 * The whole operational snapshot the cockpit renders. In production this is the
 * fan-out of several read endpoints; here it is one in-memory dataset so the UI,
 * selectors and tests share a single source of truth.
 */
export interface OperationsDataset {
  date: string;
  employees: Employee[];
  shifts: EmployeeShift[];
  cases: GoodsReceiptCase[];
  positions: ReceiptPosition[];
  bundles: AssignmentBundle[];
  issues: WorkIssue[];
  boxes: TransportBox[];
  locations: LocationMaster[];
  events: WorkflowEvent[];
  documents: DocumentRef[];
  kpis: KpiSnapshot[];
  rules: RuleConfig;
}

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
  | 'needs_review'
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
}

// ---------------------------------------------------------------------------
// §E.4 Simulation „Neu berechnen"
// ---------------------------------------------------------------------------

/** Delta the simulation proposes before going live (human-in-the-loop). */
export interface SimulationResult {
  newlyAssigned: number;
  reassigned: number;
  reserveBeforeMinutes: number;
  reserveAfterMinutes: number;
  reserveDeltaMinutes: number;
  utilisationBeforePct: number;
  utilisationAfterPct: number;
  unassignedRemaining: number;
  perEmployee: SimulationEmployeeDelta[];
}

export interface SimulationEmployeeDelta {
  employeeId: string;
  displayName: string;
  beforeMinutes: number;
  afterMinutes: number;
  deltaMinutes: number;
}

// ---------------------------------------------------------------------------
// §11 Admin / Regelpflege
// ---------------------------------------------------------------------------

export interface PriorityRuleConfig {
  catManWeight: number;
  overdueThresholdHours: number;
  fifoEnabled: boolean;
  manualPriorityWins: boolean;
}

export interface ReserveRuleConfig {
  nextShiftCapacityPct: number;
  minMinutesPerEmployee: number;
}

export interface BundleRuleConfig {
  minMinutes: number;
  maxMinutes: number;
  maxCases: number;
  maxHeavyCases: number;
}

export interface EffortRuleConfig {
  priceLabelPrintFactor: number;
  securingFactor: number;
  onlineFactor: number;
  redPriceFactor: number;
  checkShareFactor: number;
  boxSplittingFactor: number;
}

export interface LoadPlanRow {
  id: string;
  shopAreaNo: string;
  floor: string;
  weekday: string;
  validFrom: string;
  validTo?: string;
  specialDay: boolean;
}

export interface ParserTemplateRow {
  id: string;
  name: string;
  requiredFields: string[];
  detectionThreshold: number;
  fallbackToManual: boolean;
}

export interface RuleConfig {
  priority: PriorityRuleConfig;
  reserve: ReserveRuleConfig;
  bundle: BundleRuleConfig;
  effort: EffortRuleConfig;
  loadPlan: LoadPlanRow[];
  parserTemplates: ParserTemplateRow[];
}
