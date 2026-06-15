/**
 * Offline aggregate model for the Mitarbeiter-App (§12.4).
 *
 * The PWA only ever caches *already-assigned* work: a bundle ("Paket") plus the
 * per-case aggregates needed to work each Beleg without network. New
 * assignments, teamlead releases and parser checks still require the server.
 */
import type {
  GoodsReceiptCase,
  ReceiptPosition,
  TransportBoxTarget,
  WorkInstructionHeader,
} from '@paket/domain-types';

/** One ordered pickup stop in the assigned bundle (9.3 Abholreihenfolge – vorgegeben). */
export interface PickupStop {
  caseId: string;
  /** 1-based pickup order. Verbindlich; the app never lets the worker re-plan. */
  sequenceIndex: number;
  locationCode: string;
  weBelegNo: string;
  quantity: number;
  shopAreaNo?: string;
  floor?: string;
  /** Free hint shown next to the stop, e.g. 'Prio' or 'Online relevant'. */
  note?: string;
}

/** The day's assigned work bundle. Offline scope is exactly one active bundle. */
export interface AssignedBundle {
  bundleId: string;
  employeeName: string;
  workstation: string;
  /** Planned shift window as 'HH:mm' strings for display only. */
  plannedStart: string;
  plannedEnd: string;
  estimatedMinutes: number;
  pickupStops: PickupStop[];
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
export type CaseStep = 'pickup' | 'prepare' | 'positions' | 'boxing' | 'complete' | 'done';

export interface BoxProgress {
  boxNo: number;
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
  bundleId: string;
  step: CaseStep;
  pickupConfirmed: boolean;
  /** Vorbereitung: labels are printed BEFORE the carton is opened (§9.5, G.2). */
  labelsPrinted: boolean;
  /** Carton opened, filler removed, sorted by article/colour/size. */
  prepared: boolean;
  confirmedPositionIds: string[];
  /**
   * Positions whose minimum quantity control has been done. Tracked even when
   * goodsReceiptCheckMode maps the work instruction's "Prüfung = Nein"
   * (§G.1 guardrail: Nein still means quantity_only, never none).
   */
  quantityCheckedPositionIds: string[];
  boxes: BoxProgress[];
  zstDone: boolean;
  partial: boolean;
  version: number;
  updatedAt: string;
}
