/**
 * Offline aggregate model for the Mitarbeiter-App — two-phase bundle flow.
 *
 * The PWA caches exactly the engine's assignment for the day: one
 * Bereich-homogeneous bundle (the {@link BundleContext}), its consolidated
 * route-ordered pick list ({@link CollectStop}s for the COLLECT phase) and the
 * per-Beleg aggregates needed to work each Beleg offline (PROCESS phase).
 * Assignment is system-only — the worker never self-assigns; he collects the
 * whole cart, then processes each Beleg and sets the per-Beleg ZST.
 */
import type {
  GoodsReceiptCase,
  ReceiptPosition,
  TransportBoxTarget,
  WorkInstructionHeader,
  WorkInstructionPoint,
} from '@paket/domain-types';

/** Storage/goods category — drives display and the close path (Hängeware has no box). */
export type GoodsCategory = 'regal' | 'palette' | 'haengeware' | 'mixed';

/** Derived list status for a Beleg row (computed from CaseProgress + open issues). */
export type BelegStatus = 'open' | 'in_progress' | 'done' | 'issue';

/**
 * The engine bundle cached for today (one active bundle per employee). Single
 * row, id = 'today'. `caseIds` is the bundle order; the COLLECT pick list and
 * the PROCESS Beleg list both derive their order from it.
 */
export interface BundleContext {
  id: 'today';
  bundleId: string;
  employeeName: string;
  workstation: string;
  /** ISO date 'YYYY-MM-DD' of the assignment, display only. */
  date: string;
  plannedEffortMinutes: number;
  /** Homogeneous Bereich label (Regal/Palette/Hängebahn), display only. */
  bereich: string | null;
  caseIds: string[];
}

/**
 * One stop in the consolidated, route-ordered (§D.3) pick list. The whole
 * bundle's locations are listed once; `caseIds` are the Belege at this location.
 * `scanRequired` drives the optional scan affordance — collecting is a check-off,
 * scanning is never forced (client: today they do not scan).
 */
export interface CollectStop {
  sequence: number;
  locationCode: string;
  scanRequired: boolean;
  caseIds: string[];
}

/**
 * Bundle-level COLLECT progress (single row, id = 'today'). `collectedSequences`
 * are the stops the worker has checked off. The PROCESS phase is hard-gated
 * until every stop is collected.
 */
export interface BundleProgress {
  id: 'today';
  collectedSequences: number[];
  version: number;
  updatedAt: string;
}

/** One assigned Beleg as shown in the PROCESS list (ordered by the bundle). */
export interface BelegListItem {
  caseId: string;
  weBelegNo: string;
  /** Position within the bundle (`caseIds` index); drives display order. */
  order: number;
  storageLocationCode: string;
  goodsType: GoodsCategory;
  totalQuantity: number;
}

/** Everything needed to work one Beleg offline (case + instruction + positions + box targets). */
export interface CaseAggregate {
  caseId: string;
  case: GoodsReceiptCase;
  workInstruction: WorkInstructionHeader;
  positions: ReceiptPosition[];
  boxTargets: TransportBoxTarget[];
  /** Ordered Arbeitsanweisung points (derived projection from the engine/backend). */
  instructionPoints: WorkInstructionPoint[];
}

/** Per-Beleg workflow step — collapsed to a single PROCESS phase then DONE. */
export type CaseStep = 'process' | 'done';

/**
 * Mutable per-Beleg progress with an optimistic-locking `version`. Reducers in
 * workflowModel return new progress objects (immutable update); the repository
 * owns the version bump on persist.
 *
 * The flow is deliberately flat: print price labels (Beleg-level), open the
 * carton (only after labels — §G.2), confirm the minimum quantity for every
 * position (always required, even "Prüfung = Nein"), then erledigt → ZST.
 * Boxing is shown as info only and never gates completion.
 */
export interface CaseProgress {
  caseId: string;
  step: CaseStep;
  /** Price labels printed for the whole Beleg, BEFORE the carton is opened (§G.2). */
  labelsPrinted: boolean;
  /** Carton opened — only permitted once labels are printed when required. */
  cartonOpened: boolean;
  /**
   * Positions whose minimum quantity control has been done. Required for every
   * position even when the work instruction maps "Prüfung = Nein" to
   * quantity_only (§G.1: "Nein" never means none).
   */
  quantityCheckedPositionIds: string[];
  zstDone: boolean;
  partial: boolean;
  version: number;
  updatedAt: string;
}
