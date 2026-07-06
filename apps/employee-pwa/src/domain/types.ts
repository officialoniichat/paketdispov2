/**
 * Aggregate model for the Mitarbeiter-App — one-screen bundle flow.
 *
 * The PWA works exactly the engine's assignment for the day: one
 * Bereich-homogeneous bundle (the {@link BundleContext}), its consolidated
 * route-ordered pick list ({@link CollectStop}s, „Ware holen") and the
 * per-Beleg aggregates needed to work each Beleg. Assignment is
 * system-only — the worker never self-assigns; he fetches the cart's Ware,
 * then freely picks which Beleg to process and sets the per-Beleg ZST.
 *
 * These are plain types (no persistence semantics attached) — they replace
 * the former Dexie-backed `db/types.ts`. No generated `@paket/api-client`
 * schema type currently matches these shapes 1:1 (the closest, `CaseAggregateDto`,
 * lacks `onlineMarks`/`inspectionLevelLabel`/`inspectionDescription` and uses a
 * `CaseSummaryDto` instead of the full `GoodsReceiptCase`), so these are ported
 * verbatim from `db/types.ts`, dropping the Dexie-only `id: 'today'` primary-key
 * fields that existed solely for IndexedDB single-row table indexing.
 */
import type {
  GoodsReceiptCase,
  GoodsTypeText,
  OnlineSizeMark,
  ReceiptPosition,
  TransportBoxTarget,
  WorkInstructionHeader,
  WorkInstructionPoint,
} from '@paket/domain-types';

/** Storage/goods category — derived from the Lagerplatz-Art (LocationKind), drives icons. */
export type GoodsCategory = 'regal' | 'palette' | 'haengeware' | 'mixed';

/** Derived list status for a Beleg row (computed from CaseProgress + open issues). */
export type BelegStatus = 'open' | 'in_progress' | 'done' | 'partial' | 'issue';

/**
 * The engine bundle for today (one active bundle per employee). `caseIds` is
 * the bundle order; the pick list derives its order from it. The Arbeitsplatz
 * (Tisch) is NOT part of the bundle — the worker claims it at login (see
 * data/workstation.ts).
 */
export interface BundleContext {
  bundleId: string;
  employeeName: string;
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
 * Bundle-level „Ware holen" progress. `collectedSequences` are the stops the
 * worker has checked off. Processing a Beleg is hard-gated until every
 * (remaining) stop is fetched.
 */
export interface BundleProgress {
  collectedSequences: number[];
  version: number;
  updatedAt: string;
}

/** One assigned Beleg as shown in the Bearbeiten list (ordered by the bundle). */
export interface BelegListItem {
  caseId: string;
  weBelegNo: string;
  /** Position within the bundle (`caseIds` index); drives display order. */
  order: number;
  storageLocationCode: string;
  /** Derived from the Lagerplatz-Art (LocationKind) — Regal/Palette/Hängebahn icon. */
  goodsType: GoodsCategory;
  totalQuantity: number;
  /** Warenart (Vororder/Nachorder/NOS/EB …) — Selbst-Priorisierung, keine System-Empfehlung. */
  goodsTypeText?: GoodsTypeText;
  /** Preisetiketten müssen gedruckt werden — Hinweis beim Ware holen (nichts anzeigen wenn false). */
  priceLabelPrintRequired: boolean;
}

/** Everything needed to work one Beleg (case + instruction + positions + box targets). */
export interface CaseAggregate {
  caseId: string;
  case: GoodsReceiptCase;
  workInstruction: WorkInstructionHeader;
  positions: ReceiptPosition[];
  boxTargets: TransportBoxTarget[];
  /** Ordered Arbeitsanweisung points (derived projection from the engine/backend). */
  instructionPoints: WorkInstructionPoint[];
  /**
   * A8 Online-Größen-Markierung je SKU-Zeile (skuLineId → green/red). Vom Backend
   * berechnet (Fachlogik single-source); die Positions-Karte färbt nur ein.
   */
  onlineMarks: Record<string, OnlineSizeMark>;
  /** Prüfstufen-Label ("Nein"/"10 %"/"Ja") + Aufgabentext — erklärt, was die Stufe bedeutet. */
  inspectionLevelLabel?: string;
  inspectionDescription?: string;
}

/** Per-Beleg workflow step — a single PROCESS phase then DONE. */
export type CaseStep = 'process' | 'done';

/**
 * Mutable per-Beleg progress with an optimistic-locking `version`. Reducers in
 * workflowModel return new progress objects (immutable update); the persistence
 * layer owns the version bump on save.
 *
 * The flow is deliberately flat: check every position („Position geprüft",
 * un-checkable; always required, even "Prüfung = Nein" — §G.1), capture
 * Mehr-/Mindermengen per Größe directly on the card, then erledigt → ZST.
 * Printing happens upstream (vorgelagert) and is no work step here; boxing is
 * info only. Neither gates completion.
 */
export interface CaseProgress {
  caseId: string;
  step: CaseStep;
  /**
   * Positions confirmed as „Position geprüft". Required for every position even
   * when the work instruction maps "Prüfung = Nein" to quantity_only
   * (§G.1: "Nein" never means none). Toggleable (un-checkable, D5).
   */
  quantityCheckedPositionIds: string[];
  /**
   * D2 Mehr-/Mindermengen: per Größe (skuLineId → gezählte Ist-Menge), erfasst
   * direkt an der Positions-Karte. Nur Abweichungen werden gespeichert.
   */
  confirmedQuantities: Record<string, number>;
  zstDone: boolean;
  partial: boolean;
  version: number;
  updatedAt: string;
}
