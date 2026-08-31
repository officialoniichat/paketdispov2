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
import type { components } from '@paket/api-client';
import type {
  GoodsReceiptCase,
  IssueAuthorRole,
  IssueMessageKind,
  IssueStatus,
  OnlineSizeMark,
  ProblemKind,
  ReceiptPosition,
  ReceiptSkuLine,
  WorkInstructionHeader,
  WorkInstructionPoint,
} from '@paket/domain-types';

/**
 * Zusammenarbeit am geteilten Beleg (31.08.2026): Beteiligte und Prüf-Fortschritt
 * kommen fertig vom Backend (`CaseSummaryDto.collaboration`). Die PWA übernimmt die
 * generierten DTO-Typen unverändert — eine zweite, handgeschriebene Kopie wäre eine
 * zweite Wahrheit.
 */
export type CaseCollaboration = components['schemas']['CaseCollaborationDto'];
export type CaseParticipant = components['schemas']['CaseParticipantDto'];
/** Wer „Position geprüft" gesetzt hat (serverseitig, Konzept §2). */
export type PositionConfirmer = components['schemas']['PositionConfirmerDto'];

/** Ein Eintrag im Instruktions-Verlauf einer Meldung (Kundenfeedback 04.08.2026). */
export interface IssueMessageView {
  id: string;
  kind: IssueMessageKind;
  authorRole: IssueAuthorRole;
  authorName: string;
  createdAt: string;
  text: string;
}

/**
 * Eine Einzel-Meldung dieses Belegs, wie die PWA sie anzeigt: Positions-Anker
 * (positionId) für den TL-Hinweis-Block, Einzel-Status und die jüngste
 * Instruktion der Teamleitung. Der MA kann am instruierten Problem mit einer
 * Rückmeldung reagieren („Erneut melden / Rückfrage") — kein freies Chatten.
 */
export interface CaseIssueView {
  id: string;
  kind: ProblemKind;
  reasonLabel?: string;
  description?: string;
  positionId?: string;
  positionNo?: number;
  status: IssueStatus;
  /** Text der jüngsten TL-Instruktion; fehlt solange die Meldung offen ist. */
  instruction?: string;
  reportedAt: string;
  messages: IssueMessageView[];
}

/** Storage/goods category — derived from the Lagerplatz-Art (LocationKind), drives icons. */
export type GoodsCategory = 'regal' | 'palette' | 'haengeware' | 'mixed';

/**
 * App view einer Größenzeile. `correctedVkPrice` ist die serverseitig
 * persistierte Preiskorrektur (`SkuLineDto.correctedVkPrice`, Konzept §6) — sie
 * steht im Aggregat, nicht mehr im lokalen Fortschritt.
 */
export interface SkuLineView extends ReceiptSkuLine {
  /** Korrigierter VK dieser Größe; fehlt, solange der Etikettpreis stimmt. */
  correctedVkPrice?: number;
}

/**
 * App view of a ReceiptPosition. `catManDate` is a per-position display field
 * of the aggregate DTO (`ReceiptPositionDto.catManDate`) that the shared
 * domain schema does not carry — die PWA zeigt den konkreten CatMan-Termin
 * statt nur des Kennzeichens (Kundenfeedback 14.07.2026).
 *
 * `confirmedBy`/`confirmedAt` sind der serverseitige „Position geprüft"-Haken
 * (Konzept beleg-zusammenarbeit §2, 31.08.2026): eine gemeinsame Wahrheit für
 * alle Beteiligten statt eines lokalen, beim Neuladen verlorenen Zustands.
 */
export interface PositionView extends ReceiptPosition {
  /** CatMan-Termin der Position (ISO-Datum), Anzeige „CatMan 12.08.2026". */
  catManDate?: string;
  /** Prüfer der Position; fehlt, solange sie ungeprüft ist. */
  confirmedBy?: PositionConfirmer;
  /** ISO-8601 Prüfzeitpunkt. */
  confirmedAt?: string;
  skuLines: SkuLineView[];
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
  /** Meldungen des Belegs (Instruktions-Loop 04.08.2026), Anker: positionId. */
  issues: CaseIssueView[];
  /**
   * Geteilter Beleg (31.08.2026): Beteiligte + Prüf-Fortschritt, oder null, wenn
   * der Beleg nie geteilt wurde. Grundlage für „Team-Ansicht" und
   * „Teilbeleg erledigt" — berechnet wird all das im Backend.
   */
  collaboration: CaseCollaboration | null;
}

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
 * Der verbliebene LOKALE Fortschritt eines Belegs.
 *
 * Seit der Beleg-Zusammenarbeit (31.08.2026) ist die Wahrheit über „Position
 * geprüft", Ist-Mengen und Preiskorrekturen das serverseitige Aggregat
 * (`positions[].confirmedBy/confirmedAt`, `skuLines[].confirmedQuantity/
 * correctedVkPrice`, Konzept §2) — mehrere Beteiligte brauchen EINEN Stand, und
 * er überlebt jetzt auch das Neuladen. Lokal bleibt nur, was es serverseitig
 * (noch) nicht gibt: die bis zum Teilabschluss gesammelten manuellen Meldungen.
 */
export interface CaseProgress {
  caseId: string;
  /**
   * Manuell erfasste Positions-/Größen-Probleme (Problemarten aus dem
   * admin-verwalteten Katalog). Lokal gesammelt, beim Teilabschluss gesendet;
   * bis dahin entfernbar.
   */
  problems: RecordedProblem[];
}
