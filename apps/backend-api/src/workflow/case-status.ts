import type { CaseStatus } from '@paket/domain-types';

/**
 * Case status transition graph (§7.1), mapped onto the Anhang A CaseStatus enum.
 *
 * Cases enter at `ready` (ProHandel API is the system of record; there is no
 * document import/parse stage).
 *
 * Main flow:
 *   needs_review → ready → assigned → in_progress → completed → zst_done
 *
 * Sonderpfade (special paths):
 *   blocked → ready                             (Intake-Gate D1: Daten vervollständigt)
 *   ready ↔ parked                              (deliberately held back)
 *   assigned → ready                            (unassigned_by_teamlead override)
 *
 * Problem-Loop (Kundenfeedback 14.07.2026 + Instruktions-Loop 04.08.2026):
 * Teilabschluss meldet die gesammelten Probleme an den Teamlead; der Beleg bleibt
 * beim SELBEN Mitarbeiter geparkt. Der Teamlead instruiert jede Meldung EINZELN —
 * erst wenn keine Meldung mehr offen ist, kippt der Beleg auf problem_resolved.
 *   in_progress → issue_open          (Teilabschluss mit Problemen, rot/gesperrt)
 *   issue_open → problem_resolved     (alle Meldungen instruiert, grün)
 *   problem_resolved → in_progress    (derselbe MA setzt die Bearbeitung fort)
 *   problem_resolved → issue_open     (MA-Rückmeldung öffnet eine Meldung erneut)
 *
 * Aufteilung (Teamlead-Fragenkatalog 07.08.2026):
 *   ready|parked → split_container    (die Arbeit zieht in echte Teil-Belege um)
 * `split_container` ist terminal: der Beleg ist danach nur noch die fachliche Klammer
 * über seinen Teilen. Ein Zurück gäbe es nur als Wieder-Zusammenführen — die Teile sind
 * dann aber längst getrennt zugeteilt und bearbeitet worden.
 *
 * `cancelled`, `zst_done` and `split_container` are terminal.
 */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  needs_review: ['ready', 'cancelled'],
  // Intake-Gate (D1): fehlende Pflichtdaten. Freigabe erst nach Vervollständigung.
  blocked: ['ready', 'cancelled'],
  ready: ['assigned', 'parked', 'cancelled', 'split_container'],
  parked: ['ready', 'cancelled', 'split_container'],
  assigned: ['in_progress', 'ready', 'cancelled'],
  in_progress: ['issue_open', 'completed', 'cancelled'],
  issue_open: ['problem_resolved', 'cancelled'],
  problem_resolved: ['in_progress', 'issue_open', 'cancelled'],
  completed: ['zst_done'],
  zst_done: [],
  cancelled: [],
  split_container: [],
};

export const TERMINAL_STATUSES: readonly CaseStatus[] = [
  'zst_done',
  'cancelled',
  'split_container',
];

/** Transitions that only a teamlead may trigger (pool steering / overrides). */
export const TEAMLEAD_ONLY_TARGETS: readonly CaseStatus[] = ['parked'];

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
