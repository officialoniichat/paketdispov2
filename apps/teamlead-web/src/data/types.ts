/**
 * View-model types for the Teamlead cockpit (§10/§11, Anhang E.4).
 *
 * These are UI/projection shapes the cockpit components render. The live data
 * layer (see {@link ./remoteDataset}, {@link ./belege}) populates them from the
 * @paket/api-client read endpoints, mapping each DTO field-by-field so the
 * feature components stay free of transport concerns.
 */
import type {
  AssignmentStatus,
  GoodsReceiptCase,
  IssueAuthorRole,
  IssueMessageKind,
  IssueStatus,
  LabelPrintVariant,
  ProblemKind,
  SkillTier,
  WorkIssue,
} from '@paket/domain-types';

/** Ein Eintrag im Instruktions-Verlauf einer Meldung (Kundenfeedback 04.08.2026). */
export interface CardIssueMessage {
  id: string;
  kind: IssueMessageKind;
  authorRole: IssueAuthorRole;
  authorName: string;
  createdAt: string;
  text: string;
}

/**
 * Eine Einzel-Meldung eines Belegs, wie die Karten/Detail-Ansichten sie zeigen:
 * Art + Positions-Anker + Einzel-Status + Instruktions-Verlauf.
 */
export interface CardIssue {
  id: string;
  kind: ProblemKind;
  reasonLabel: string | null;
  description: string | null;
  positionNo: number | null;
  orderNo: string | null;
  status: IssueStatus;
  /** Text der jüngsten TL-Instruktion; null solange die Meldung offen ist. */
  instruction: string | null;
  /** Standardanweisung der Problemart (Katalog-Vorlage); null ohne Vorlage. */
  defaultInstruction: string | null;
  /** true = Vorlage im Instruktions-Dialog automatisch vorausfüllen. */
  defaultInstructionAuto: boolean;
  reportedAt: string;
  messages: CardIssueMessage[];
}

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
  /**
   * Monster-Beleg (C6): über der gepflegten Teile-Schwelle, deshalb von der Automatik
   * ausgenommen und auf eine Teamlead-Entscheidung wartend. Kommt fertig gerechnet vom
   * Backend — die Schwelle lebt in der Regelpflege, nicht hier.
   */
  isMonster: boolean;
  storageCode: string;
  assignedTo?: string;
  issueStatus?: WorkIssue['status'];
  /**
   * Instruktions-Loop (04.08.2026): ALLE Meldungen des Belegs mit Einzel-Status.
   * Display label = `reasonLabel ?? problemKindLabels[kind]` (manuelle Probleme
   * snapshoten ihr ProblemReason-Katalog-Label). Leer ohne Meldungen.
   */
  issues: CardIssue[];
  /** C5: Weiterleitungs-Empfänger; null = nicht weitergeleitet. */
  forwardedTo: string | null;
  /** Fester Bereich des Belegs (Zuweisen-Dialog, weiche Warnung). */
  bereich: string | null;
  /** TL-Topf (A7): „Besondere Aufmerksamkeit". */
  attentionFlag: boolean;
  attentionNote: string | null;
  /** „Gehört zusammen"-Lieferung; null für Einzel-Belege (A1). */
  deliveryGroup: DeliveryGroupRef | null;
  /** Filiale des Beleg-Kopfs — Kachel-Infozeile (Kundenfeedback 07.08.2026). */
  branchNo: string;
  /** Alle Shops des Belegs (Primär zuerst) — Kachel-Infozeile. */
  shopNos: string[];
  /**
   * Etikett-Druckvarianten, die auf dem Beleg vorkommen — belegweit vom Backend
   * aggregiert (nur tatsächlich vorkommende, in Anzeige-Reihenfolge).
   */
  labelPrintVariants: LabelPrintVariant[];
  /** Mindestens eine Position verlangt Sicherung (Backend-Aggregat). */
  securityRequired: boolean;
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
  /** Kurz-Kennung der Lieferung (Frage 8): gemeinsame Lieferschein-Nr, sonst „ab WE …". */
  label: string;
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
  /**
   * Bündel, in dem dieses Item wirklich liegt — bei Multi-Bündel-Zeilen je Beleg
   * verschieden (row.bundleId trägt nur das erste Bündel der Zeile). Optional,
   * damit Test-Fixtures und optimistische Platzhalter schlank bleiben.
   */
  bundleId?: string;
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
  /** AssignmentStatus of the current Bündel; undefined if free. */
  bundleStatus?: AssignmentStatus;
  paused: boolean;
  /** Fixed Bereiche/skills of the employee (shown on idle rows too). */
  bereiche: string[];
  /** Geplanter Schichtbeginn/-ende (ISO): Früh/Spät-Farbe + „ab HH:MM" in der Matrix. */
  shiftStart?: string | null;
  shiftEnd?: string | null;
  /** Heutige Abwesenheit (Schichtplan-Kalender): Zeile ganz unten, durchgestrichen. */
  absence?: 'krank' | 'urlaub' | null;
  /** Cases assigned to this bundle, in pickup order (manual-intervention source). */
  cases: BoardCase[];
  /**
   * Engine-Packs (Starter- + Folge-Packs) in Bündel-Reihenfolge, persistiert je
   * Beleg (`AssignmentItem.packIndex`) — jeder Beleg der Zeile gehört genau
   * einem Pack, auch manuell zugewiesene. Optional, damit Test-Fixtures schlank
   * bleiben.
   */
  packs?: BoardPack[];
}

/**
 * Ein Pack der Zeile. `active` ist das Pack, an dem der Mitarbeiter GERADE
 * arbeitet — nur dessen Belege sieht er in seiner App (Pull-Prinzip); spätere
 * Packs sind vorgeplant und dort noch unsichtbar.
 */
export interface BoardPack {
  /**
   * Persistierter Pack-Index im Bündel (`AssignmentItem.packIndex`) — der Wert,
   * den `moveCase` als `targetPackIndex` erwartet. Nicht die Position in dieser
   * Liste: ein leergelaufenes Pack fällt raus, die übrigen behalten ihren Index.
   */
  index: number;
  caseIds: string[];
  active: boolean;
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
/** Anzeige-Metadaten eines geplanten Belegs (kommen aus dem Engine-Lauf mit). */
export interface PreviewBundleCase {
  caseId: string;
  weBelegNo: string;
  teile: number;
  minutes: number;
}

/** Ein vom Engine-Lauf geplantes Bündel (Preview: reine Vorschau, nichts persistiert). */
export interface PreviewBundle {
  bundleId: string;
  employeeId: string;
  /** Belege in Abhol-Reihenfolge. */
  caseIds: string[];
  /** Selbe Reihenfolge wie caseIds. */
  cases: PreviewBundleCase[];
  plannedEffortMinutes: number;
  effortPoints: number;
}

export interface PreviewResult {
  date: string;
  bundleCount: number;
  assignedCaseCount: number;
  unassignedCaseCount: number;
  durationMs: number;
  loads: PreviewEmployeeLoad[];
  /** Geplante Bündel in Engine-Reihenfolge — Datenquelle der Vorverteilungs-Vorschau. */
  bundles: PreviewBundle[];
}

