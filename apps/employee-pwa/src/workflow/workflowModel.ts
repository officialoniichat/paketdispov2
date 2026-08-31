/**
 * Pure per-Beleg workflow model — collapsed PROCESS phase.
 *
 * Seit der Beleg-Zusammenarbeit (31.08.2026) ist das AGGREGAT die Wahrheit über
 * den Prüf-Stand: „Position geprüft" steht als `positions[].confirmedBy` am
 * Server, Ist-Menge und Preiskorrektur als `skuLines[].confirmedQuantity` /
 * `correctedVkPrice`. Die Funktionen hier lesen deshalb das Aggregat statt eines
 * lokalen Spiegels; `CaseProgress` trägt nur noch die bis zum Teilabschluss
 * gesammelten manuellen Meldungen (siehe `domain/types.ts`).
 *
 * Der Ablauf bleibt flach: „Position geprüft" je Position (immer nötig, auch bei
 * „Prüfung = Nein" — §G.1; rücknehmbar, D5), Mehr-/Mindermengen je Größe direkt
 * an der Karte (D2), dann ein sauberes „Beleg erledigt" → ZST. Drucken ist
 * vorgelagert und Karton öffnen kein Arbeitsschritt (C4); Boxen ist reine
 * Information und sperrt nie den Abschluss.
 */
import type { WorkInstructionHeader } from '@paket/domain-types';
import type {
  CaseAggregate,
  CaseParticipant,
  CaseProgress,
  PositionView,
  RecordedProblem,
  SkuLineView,
} from '../domain/types.js';

/** Frischer lokaler Fortschritt eines Belegs: noch keine Meldung gesammelt. */
export function initialProgress(aggregate: CaseAggregate): CaseProgress {
  return { caseId: aggregate.caseId, problems: [] };
}

/** True when a scanned code matches the expected location (case/space-insensitive). */
export function scanMatches(scanned: string, expected: string): boolean {
  return scanned.trim().toUpperCase() === expected.trim().toUpperCase();
}

// --- Ableitungen aus dem Aggregat -----------------------------------------

/** Alle Größenzeilen des Belegs — eine Quelle für Mengen, Preise und Summen. */
function allSkuLines(aggregate: CaseAggregate): SkuLineView[] {
  return aggregate.positions.flatMap((pos) => pos.skuLines);
}

/** Ist-Menge einer Größe: die erfasste Zählung, sonst das Soll. */
export function istMenge(sku: SkuLineView): number {
  return sku.confirmedQuantity ?? sku.expectedQuantity;
}

/**
 * „Berührt" ist eine Größenzeile, die eine Mengenabweichung ODER eine
 * Preiskorrektur trägt. Nur solche Zeilen gehen in `skuQuantities` (Konzept §7:
 * der Server mischt sie mit dem persistierten Stand, unberührt zählt Ist = Soll).
 */
export function isSkuTouched(sku: SkuLineView): boolean {
  return istMenge(sku) !== sku.expectedQuantity || sku.correctedVkPrice !== undefined;
}

/** True, sobald die Position serverseitig als geprüft markiert ist. */
export const isPositionChecked = (pos: PositionView): boolean => pos.confirmedBy !== undefined;

// --- Guardrails -----------------------------------------------------------

/**
 * §G.1 guardrail: a minimum quantity control is always required, even when the
 * work instruction's "Prüfung Wareneingang = Nein" mapped to quantity_only.
 * "Nein" never means none.
 */
export function requiresQuantityCheck(wi: WorkInstructionHeader): boolean {
  return wi.minimumQuantityCheckAlwaysRequired === true;
}

/** Jede Position des Belegs ist geprüft — egal von wem (geteilter Beleg §5.2). */
export const allQuantitiesChecked = (aggregate: CaseAggregate): boolean =>
  aggregate.positions.every(isPositionChecked);

/**
 * Alle Probleme des Belegs (Kundenfeedback 14.07.2026, Punkt 7): manuell erfasste
 * Positions-Probleme + IMPLIZITE Probleme (Mehr-/Minderlieferung, Preisabweichung)
 * aus dem Aggregat. Sobald eines vorliegt, ist „Beleg erledigt" gesperrt und der
 * Teilabschluss der Weg.
 */
export function hasAnyProblem(p: CaseProgress, aggregate: CaseAggregate): boolean {
  return p.problems.length > 0 || allSkuLines(aggregate).some(isSkuTouched);
}

export interface CompletionGate {
  ok: boolean;
  reasons: string[];
}

/**
 * Hard preconditions for „Beleg erledigt" (voll) → ZST. Every position must be
 * geprüft, and there may be NO problem — neither manual nor implicit (Mehr-/
 * Minderlieferung, Preisabweichung). Bei einem Problem ist der Teilabschluss der
 * einzige Weg (das Backend würde „Beleg erledigt" ohnehin ablehnen).
 */
export function canCompleteCase(p: CaseProgress, aggregate: CaseAggregate): CompletionGate {
  const reasons: string[] = [];
  if (requiresQuantityCheck(aggregate.workInstruction) && !allQuantitiesChecked(aggregate)) {
    reasons.push('Noch nicht alle Positionen geprüft');
  }
  if (hasAnyProblem(p, aggregate)) {
    reasons.push('Abweichung/Problem erfasst – nur Teilabschluss möglich');
  }
  return { ok: reasons.length === 0, reasons };
}

// --- Immutable transitions ------------------------------------------------

/** Fügt ein manuell erfasstes Problem hinzu (Grund aus dem Katalog). */
export function addProblem(p: CaseProgress, problem: RecordedProblem): CaseProgress {
  return { ...p, problems: [...p.problems, problem] };
}

/** Entfernt ein manuell erfasstes Problem wieder (vor dem Teilabschluss). */
export function removeProblem(p: CaseProgress, problemId: string): CaseProgress {
  return { ...p, problems: p.problems.filter((x) => x.id !== problemId) };
}

/**
 * Total Ist-Menge across every Größe (SKU line) in the Beleg: die erfasste
 * Zählung, wo eine vorliegt (D2 Mehr-/Mindermengen), sonst das Soll dieser Größe.
 */
export function totalConfirmedQuantity(aggregate: CaseAggregate): number {
  return allSkuLines(aggregate).reduce((sum, sku) => sum + istMenge(sku), 0);
}

/** Eine Größenzeile im Request-Body: Ist-Menge + optional korrigierter VK. */
export interface SkuQuantityBody {
  skuLineId: string;
  confirmedQuantity: number;
  correctedVkPrice?: number;
}

/**
 * Eigene Sitzungs-Eingabe an einer Größenzeile: Feld weggelassen = nie berührt,
 * null = zurückgesetzt. Strukturgleich mit `SkuLinePatch` der Datenschicht —
 * hier eigens deklariert, damit das reine Modell ohne `data/`-Import bleibt.
 */
export interface OwnSkuLineInput {
  confirmedQuantity?: number | null;
  correctedVkPrice?: number | null;
}

/**
 * Baut die `skuQuantities` für „Beleg erledigt"/Teilabschluss: NUR Größenzeilen,
 * die ICH in dieser Sitzung angefasst habe (`ownInputs`), mit MEINEN zuletzt
 * eingegebenen Werten über dem Aggregat-Stand — nicht mit dem, was der Cache
 * gerade zeigt (ein Refetch kann den optimistischen Patch überschrieben haben).
 * Das Backend mischt den Body mit dem über den Zähl-Endpunkt persistierten
 * Stand; weggelassene Zeilen bleiben unangetastet. Fremde Zählungen aus dem
 * geteilten Aggregat dürfen deshalb nicht hinein, sonst überschriebe der
 * Abschluss den frischeren Stand eines anderen Beteiligten.
 */
export function skuQuantitiesBody(
  aggregate: CaseAggregate,
  ownInputs: ReadonlyMap<string, OwnSkuLineInput>,
): SkuQuantityBody[] {
  return allSkuLines(aggregate)
    .flatMap((sku) => {
      const input = ownInputs.get(sku.id);
      if (!input) return [];
      const merged: SkuLineView = {
        ...sku,
        ...(input.confirmedQuantity !== undefined
          ? { confirmedQuantity: input.confirmedQuantity ?? undefined }
          : {}),
        ...(input.correctedVkPrice !== undefined
          ? { correctedVkPrice: input.correctedVkPrice ?? undefined }
          : {}),
      };
      return isSkuTouched(merged) ? [merged] : [];
    })
    .map((sku) => ({
      skuLineId: sku.id,
      confirmedQuantity: istMenge(sku),
      ...(sku.correctedVkPrice !== undefined ? { correctedVkPrice: sku.correctedVkPrice } : {}),
    }));
}

/** Eine manuelle Problemmeldung im Request-Body des Teilabschlusses. */
export interface ProblemBody {
  positionId: string;
  skuLineId?: string;
  reasonId: string;
  note?: string;
}

/** Baut die manuellen `problems` für den Teilabschluss aus den lokal gesammelten. */
export function problemsBody(p: CaseProgress): ProblemBody[] {
  return p.problems.map((x) => ({
    positionId: x.positionId,
    ...(x.skuLineId ? { skuLineId: x.skuLineId } : {}),
    reasonId: x.reasonId,
    ...(x.note ? { note: x.note } : {}),
  }));
}

// --- Geteilter Beleg (Zusammenarbeit 31.08.2026) ---------------------------

/**
 * Aktiv beteiligt sind `angenommen` und `teil_erledigt` (Konzept §6) —
 * Eingeladene, Abgelehnte und Entfernte arbeiten nicht mit. Reine
 * Anzeige-Ableitung aus dem Backend-DTO; die Regeln selbst erzwingt der Server.
 */
export const isParticipantActive = (participant: CaseParticipant): boolean =>
  participant.status === 'angenommen' || participant.status === 'teil_erledigt';

/** Alle aktiven Beteiligten des Belegs (inkl. mir), in Backend-Reihenfolge. */
export function activeParticipants(aggregate: CaseAggregate): CaseParticipant[] {
  return (aggregate.collaboration?.participants ?? []).filter(isParticipantActive);
}

/** Die aktiven Beteiligten AUSSER mir — sie füllen die „Team-Ansicht". */
export function otherActiveParticipants(
  aggregate: CaseAggregate,
  meineEmployeeNo: string | undefined,
): CaseParticipant[] {
  return activeParticipants(aggregate).filter((p) => p.employeeNo !== meineEmployeeNo);
}

/**
 * Geteilt ist ein Beleg für mich, sobald mindestens EIN anderer aktiv beteiligt
 * ist — ob ich Inhaber bin oder selbst helfe, spielt keine Rolle.
 */
export const isSharedCase = (
  aggregate: CaseAggregate,
  meineEmployeeNo: string | undefined,
): boolean => otherActiveParticipants(aggregate, meineEmployeeNo).length > 0;

/** Meine eigene Beteiligungs-Zeile (jeden Status), falls es eine gibt. */
export function myParticipation(
  aggregate: CaseAggregate,
  meineEmployeeNo: string | undefined,
): CaseParticipant | undefined {
  if (meineEmployeeNo === undefined) return undefined;
  return aggregate.collaboration?.participants.find((p) => p.employeeNo === meineEmployeeNo);
}

/** Positionsnummern, die dieser Beteiligte geprüft hat — aufsteigend sortiert. */
export function checkedPositionNos(aggregate: CaseAggregate, employeeNo: string): number[] {
  return aggregate.positions
    .filter((pos) => pos.confirmedBy?.employeeNo === employeeNo)
    .map((pos) => pos.positionNo)
    .sort((a, b) => a - b);
}
