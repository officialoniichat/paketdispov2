/**
 * Aggregate model for the Mitarbeiter-App.
 *
 * The bundle/list display itself reads the generated `@paket/api-client` DTOs
 * directly (`/api/me/today`, see BundleHomeScreen) — what lives here are the
 * types the PROCESS workflow needs: the per-Beleg {@link CaseAggregate} and the
 * local, mutable {@link CaseProgress} the workflow reducers operate on.
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
  OnlineSizeMark,
  ReceiptPosition,
  WorkInstructionHeader,
  WorkInstructionPoint,
} from '@paket/domain-types';

/** Storage/goods category — derived from the Lagerplatz-Art (LocationKind), drives icons. */
export type GoodsCategory = 'regal' | 'palette' | 'haengeware' | 'mixed';

/**
 * App view of a ReceiptPosition. `catManDate` is a per-position display field
 * of the aggregate DTO (`ReceiptPositionDto.catManDate`) that the shared
 * domain schema does not carry — the PWA shows the konkrete CatMan-Termin
 * statt nur des Kennzeichens (Kundenfeedback 14.07.2026).
 */
export interface PositionView extends ReceiptPosition {
  /** CatMan-Termin der Position (ISO-Datum), Anzeige „CatMan 12.08.2026". */
  catManDate?: string;
}

/** Everything needed to work one Beleg (case + instruction + positions). */
export interface CaseAggregate {
  caseId: string;
  case: GoodsReceiptCase;
  workInstruction: WorkInstructionHeader;
  positions: PositionView[];
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
 * Ein manuell erfasstes Problem an einer Position (optional auf eine
 * Größenzeile eingegrenzt). Lokal gesammelt und erst beim Teilabschluss als
 * `ReportedProblemDto[]` an das Backend übertragen. `reasonLabel` ist der
 * Anzeigename aus dem admin-verwalteten ProblemReason-Katalog — mitgespeichert,
 * damit Markierung und Teilabschluss-Zusammenfassung ohne erneuten
 * Katalog-Lookup rendern.
 */
export interface RecordedProblem {
  /** Client-generierte Id — nur für lokale Anzeige/Entfernen, geht nicht ans Backend. */
  id: string;
  positionId: string;
  /** Optional auf eine Größenzeile eingegrenzt. */
  skuLineId?: string;
  /** ProblemReason-Katalog-Eintrag. */
  reasonId: string;
  /** Deutsches Label der gewählten Problemart (Katalog). */
  reasonLabel: string;
  /** Freitext-Notiz des MA. */
  note?: string;
}

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
  /**
   * Korrigierter VK je Größe (skuLineId → Preis), wenn der VK-Etikett-Preis
   * falsch ist. Ein gesetzter Preis gleich dem Etikettpreis zählt nicht als
   * Korrektur und wird gar nicht erst gespeichert. Jede Korrektur ist ein
   * implizites Problem (Preisabweichung) und erzwingt den Teilabschluss.
   */
  correctedVkPrices: Record<string, number>;
  /**
   * Manuell erfasste Positions-/Größen-Probleme (Problemarten aus dem
   * admin-verwalteten Katalog). Lokal gesammelt, beim Teilabschluss gesendet;
   * bis dahin entfernbar.
   */
  problems: RecordedProblem[];
  zstDone: boolean;
  partial: boolean;
  version: number;
  updatedAt: string;
}
