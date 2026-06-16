/**
 * Offline aggregate model for the Mitarbeiter-App (§12.4).
 *
 * The PWA only ever caches *already-assigned* work: the day context, the
 * priority-sorted list of assigned Belege, and the per-case aggregates needed
 * to work each Beleg offline. Assignment is system-only — the worker never
 * self-assigns; he only chooses the order among the assigned Belege.
 */
import type {
  GoodsReceiptCase,
  ReceiptPosition,
  TransportBoxTarget,
  WorkInstructionHeader,
} from '@paket/domain-types';

/** Storage/goods category — drives the close path (Hängeware skips boxing). */
export type GoodsCategory = 'regal' | 'palette' | 'haengeware' | 'mixed';

/** Derived list status for a Beleg row (computed from CaseProgress + issues). */
export type BelegStatus = 'open' | 'in_progress' | 'done' | 'issue';

/** Day-level context shown on the hub header. Single row, id = 'today'. */
export interface DayContext {
  id: 'today';
  employeeName: string;
  workstation: string;
  /** Planned shift window as 'HH:mm' strings for display only. */
  plannedStart: string;
  plannedEnd: string;
  estimatedMinutes: number;
  /** Verladetag/Abfahrt as 'HH:mm' or ISO date string, display only. */
  verladetag?: string;
}

/** One assigned Beleg as shown in the selectable list (no forced order). */
export interface BelegListItem {
  caseId: string;
  weBelegNo: string;
  /** Lower = higher priority. Used only for the recommended sort order. */
  prioRank: number;
  section: number | null;
  storageLocationCode: string;
  goodsType: GoodsCategory;
  totalQuantity: number;
  /** True when this Beleg carries a same-day priority flag (NOS/Extra). */
  urgent: boolean;
}

/** Everything needed to work one Beleg offline (case + instruction + positions + box targets). */
export interface CaseAggregate {
  caseId: string;
  case: GoodsReceiptCase;
  workInstruction: WorkInstructionHeader;
  positions: ReceiptPosition[];
  boxTargets: TransportBoxTarget[];
}

/** Linear per-case workflow steps (Progressive Disclosure, §E.3). */
export type CaseStep = 'pickup' | 'prepare' | 'positions' | 'sort' | 'boxing' | 'complete' | 'done';

export interface BoxProgress {
  boxNo: number;
  /** Positions assigned to this box (seeded from the engine's boxTargets). */
  positionIds: string[];
  labelPrinted: boolean;
  sealed: boolean;
  onConveyor: boolean;
}

/**
 * Mutable per-case progress with an optimistic-locking `version`.
 * Reducers in workflowModel return new progress objects (immutable update);
 * the repository owns the version bump on persist.
 */
export interface CaseProgress {
  caseId: string;
  step: CaseStep;
  pickupConfirmed: boolean;
  /** Vorbereitung: labels are printed BEFORE the carton is opened (§9.5, G.2). */
  labelsPrinted: boolean;
  /** Carton opened (individual step, no longer derived from labelsPrinted). */
  cartonOpened: boolean;
  /** Carton opened, filler removed, sorted by article/colour/size. */
  prepared: boolean;
  confirmedPositionIds: string[];
  /**
   * Positions whose minimum quantity control has been done. Tracked even when
   * goodsReceiptCheckMode maps the work instruction's "Prüfung = Nein"
   * (§G.1 guardrail: Nein still means quantity_only, never none).
   */
  quantityCheckedPositionIds: string[];
  /** Box-sort step: worker confirmed the engine's position→box mapping. */
  boxAssignmentConfirmed: boolean;
  boxes: BoxProgress[];
  zstDone: boolean;
  partial: boolean;
  version: number;
  updatedAt: string;
}
