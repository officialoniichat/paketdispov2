/**
 * Reine Ordnungs-Helfer der Kanban-Rasteransicht des Mitarbeiterboards.
 *
 * Hier entsteht KEINE Fachlogik: die Phasen-Einteilung spiegelt nur den vom
 * Backend gelieferten Case-Status, und die Reorder-Berechnung erzeugt lediglich
 * die caseIds-Reihenfolge für den bestehenden, auditierten
 * `/bundles/{id}/reorder`-Eingriff (§8.4).
 */
import type { SkillTier } from '@paket/domain-types';
import type { BoardCase, BoardRow } from '../../data/types.js';

/** Karten-Abschnitt einer Bündel-Position in der Rasteransicht. */
export type KanbanPhase = 'laufend' | 'geplant' | 'fertig';

/** In Bearbeitung beim Mitarbeiter — gestartet bzw. Problemfall beim SELBEN MA. */
const LAUFEND: ReadonlySet<BoardCase['status']> = new Set([
  'in_progress',
  'issue_open',
  'problem_resolved',
]);
const FERTIG: ReadonlySet<BoardCase['status']> = new Set(['completed', 'zst_done']);

export function phaseOf(status: BoardCase['status']): KanbanPhase {
  if (LAUFEND.has(status)) return 'laufend';
  if (FERTIG.has(status)) return 'fertig';
  return 'geplant';
}

export interface PartitionedCases {
  laufend: BoardCase[];
  geplant: BoardCase[];
  fertig: BoardCase[];
}

/** Bündel-Positionen (in Abholreihenfolge) auf die drei Abschnitte verteilen. */
export function partitionBoardCases(cases: readonly BoardCase[]): PartitionedCases {
  const out: PartitionedCases = { laufend: [], geplant: [], fertig: [] };
  for (const c of cases) out[phaseOf(c.status)].push(c);
  return out;
}

/** Drop-Ziel innerhalb DESSELBEN Mitarbeiters. */
export type SameEmployeeDropTarget =
  | { kind: 'zone'; phase: 'laufend' | 'geplant' }
  | { kind: 'before'; caseId: string };

/**
 * Neue Bündel-Reihenfolge für einen Drop innerhalb desselben Mitarbeiters —
 * oder null, wenn der Drop nichts ändert bzw. nicht erlaubt ist. Nur GEPLANTE
 * Belege sind umsortierbar; ob ein Beleg läuft oder fertig ist, bestimmt der
 * Bearbeitungsstand des Mitarbeiters (PWA), nicht das Board.
 *
 * - Zone „laufend"  → „als Nächstes vorziehen": direkt hinter den laufenden
 *   Block, vor alle Geplanten.
 * - Zone „geplant"  → ans Ende der Geplanten.
 * - „before"        → unmittelbar vor den genannten (geplanten) Beleg.
 */
export function reorderForDrop(
  cases: readonly BoardCase[],
  draggedCaseId: string,
  target: SameEmployeeDropTarget,
): string[] | null {
  const dragged = cases.find((c) => c.caseId === draggedCaseId);
  if (!dragged || phaseOf(dragged.status) !== 'geplant') return null;

  const rest = cases.filter((c) => c.caseId !== draggedCaseId);
  let insertAt: number;
  if (target.kind === 'before') {
    if (target.caseId === draggedCaseId) return null;
    const idx = rest.findIndex((c) => c.caseId === target.caseId);
    if (idx === -1 || phaseOf(rest[idx]!.status) !== 'geplant') return null;
    insertAt = idx;
  } else if (target.phase === 'laufend') {
    const firstGeplant = rest.findIndex((c) => phaseOf(c.status) === 'geplant');
    insertAt = firstGeplant === -1 ? rest.length : firstGeplant;
  } else {
    // Hinter die letzte nicht-fertige Position (Fertige hängen am Ende).
    let last = -1;
    rest.forEach((c, i) => {
      if (phaseOf(c.status) !== 'fertig') last = i;
    });
    insertAt = last + 1;
  }

  const next = [...rest.slice(0, insertAt), dragged, ...rest.slice(insertAt)].map((c) => c.caseId);
  return next.join() === cases.map((c) => c.caseId).join() ? null : next;
}

// ---------------------------------------------------------------------------
// Toolbar der Rasteransicht: Anzeige-Sortierung + Erfahrungs-Filter (rein Client)
// ---------------------------------------------------------------------------

/** Skill-Leiter in Rangfolge hoch → niedrig (auch Reihenfolge der Filter-Chips). */
export const SKILL_TIER_ORDER: readonly SkillTier[] = [
  'profi',
  'fortgeschritten',
  'basis',
  'starter',
  'dummy',
];

/** Anzeige-Sortierung der Mitarbeiter-Karten. */
export type BoardSort = 'standard' | 'frei' | 'voll' | 'erfahrung' | 'erfahrung_auf';

export const BOARD_SORTS: readonly BoardSort[] = [
  'standard',
  'frei',
  'voll',
  'erfahrung',
  'erfahrung_auf',
];

function tierRank(tier: SkillTier): number {
  return SKILL_TIER_ORDER.length - SKILL_TIER_ORDER.indexOf(tier);
}

/**
 * Verplante Last einer Karte für „frei ↔ verplant": Teile-first (B3 — die fett
 * angezeigte Stückzahl ist DIE Last-Anzeige), Minuten und Kapazitäts-% nur als
 * Tie-Breaker. Bewusst NICHT primär utilisationPct: der Prozentwert hängt an der
 * individuellen Kapazität (Teilzeit!) und wirkt neben den Karteninhalten falsch.
 */
function loadCompare(a: BoardRow, b: BoardRow): number {
  return (
    a.plannedTeile - b.plannedTeile ||
    a.assignedMinutes - b.assignedMinutes ||
    a.utilisationPct - b.utilisationPct
  );
}

/** Karten-Reihenfolge; 'standard' behält die Server-Reihenfolge (stabile Sortierung). */
export function sortBoardRows(rows: readonly BoardRow[], sort: BoardSort): BoardRow[] {
  const copy = [...rows];
  switch (sort) {
    case 'frei':
      return copy.sort(loadCompare);
    case 'voll':
      return copy.sort((a, b) => loadCompare(b, a));
    case 'erfahrung':
      return copy.sort((a, b) => tierRank(b.skillTier) - tierRank(a.skillTier));
    case 'erfahrung_auf':
      return copy.sort((a, b) => tierRank(a.skillTier) - tierRank(b.skillTier));
    default:
      return copy;
  }
}

/** Erfahrungs-Filter; leere Auswahl = alle Mitarbeiter. */
export function filterBoardRows(
  rows: readonly BoardRow[],
  tiers: readonly SkillTier[],
): BoardRow[] {
  if (tiers.length === 0) return [...rows];
  const wanted = new Set(tiers);
  return rows.filter((r) => wanted.has(r.skillTier));
}
