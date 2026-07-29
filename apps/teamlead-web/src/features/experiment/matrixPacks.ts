/**
 * Experiment DA.M.B — Pack-Ableitung für die Mitarbeiter-Matrix (reine Anzeige).
 *
 * Ein „Pack" ist die Engine-Einheit der Tagesplanung (Starter-Pack + Folge-
 * Packs, Konfig starterPackMin/MaxTeile). Persistiert wird nur das flache
 * Bündel; die Pack-Grenzen liefert der Board-Endpoint als caseId-Listen
 * (BoardRow.packs, rekonstruiert aus `bundle.created`/`bundle.extended`).
 * Hier wird nur gruppiert und für die Anzeige geordnet — keine Fachlogik.
 */
import type { BoardCase } from '../../data/types.js';

export interface MatrixPack {
  key: string;
  label: string;
  /** Belege des Packs, anzeige-geordnet (Laufendes oben, Fertiges unten). */
  cases: BoardCase[];
  teile: number;
}

/** Anzeige-Rang: Laufendes oben (blau/rot), Geplantes mittig, Fertiges unten. */
function displayRank(status: BoardCase['status']): number {
  switch (status) {
    case 'in_progress':
    case 'issue_open':
    case 'problem_resolved':
      return 0;
    case 'completed':
    case 'zst_done':
    case 'cancelled':
      return 2;
    default:
      return 1;
  }
}

/** Stabil sortiert: der Beleg in Arbeit (blau) oben, Fertige (grün) unten. */
export function orderPackCases(cases: readonly BoardCase[]): BoardCase[] {
  return [...cases].sort((a, b) => displayRank(a.status) - displayRank(b.status));
}

/**
 * Gruppiert die Bündel-Belege einer Zeile in Packs. Nennen mehrere Events einen
 * Beleg (z. B. nach Wieder-Zuweisung), gewinnt das chronologisch spätere Pack;
 * Belege ohne Pack-Zugehörigkeit (manuell zugewiesen/verschoben) bilden das
 * Schluss-Pack „Manuell" — bzw. „Pack 1", wenn gar keine Pack-Daten vorliegen.
 */
export function derivePacks(
  cases: readonly BoardCase[],
  packCaseIds: readonly string[][] | undefined,
): MatrixPack[] {
  const byCaseId = new Map(cases.map((c) => [c.caseId, c]));
  const packIndexByCase = new Map<string, number>();
  (packCaseIds ?? []).forEach((ids, index) => {
    for (const id of ids) {
      if (byCaseId.has(id)) packIndexByCase.set(id, index); // später überschreibt früher
    }
  });

  const buckets = new Map<number, BoardCase[]>();
  const manual: BoardCase[] = [];
  for (const c of cases) {
    const index = packIndexByCase.get(c.caseId);
    if (index === undefined) {
      manual.push(c);
    } else {
      const list = buckets.get(index) ?? [];
      list.push(c);
      buckets.set(index, list);
    }
  }

  const packs: MatrixPack[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, members], displayIndex) => ({
      key: `pack-${index}`,
      label: `Pack ${displayIndex + 1}`,
      cases: orderPackCases(members),
      teile: members.reduce((sum, c) => sum + c.totalQuantity, 0),
    }));

  if (manual.length > 0) {
    packs.push({
      key: 'pack-manuell',
      label: packs.length === 0 ? 'Pack 1' : 'Manuell',
      cases: orderPackCases(manual),
      teile: manual.reduce((sum, c) => sum + c.totalQuantity, 0),
    });
  }
  return packs;
}

/** Status-Farbe eines Belegstrichs; null = neutrale bzw. Lieferungs-Gruppenfarbe. */
export interface StripStyle {
  color: string;
  strike: boolean;
  statusLabel: string;
}

/**
 * Statusfarben überschreiben die Gruppen-Identität (Nutzer-Vorgabe): blau = in
 * Arbeit, rot = Problem, grün + durchgestrichen = fertig. Geplante Belege
 * liefern null und erben die Lieferungs-Gruppenfarbe.
 */
/** Einträge der Farb-Legende (Info-Kreis der Matrix) — aus stripStyle abgeleitet. */
const LEGEND_STATUSES: ReadonlyArray<{ status: BoardCase['status']; text: string }> = [
  { status: 'in_progress', text: 'in Arbeit — liegt immer oben' },
  { status: 'issue_open', text: 'Problem offen' },
  { status: 'problem_resolved', text: 'Problem geklärt' },
  { status: 'completed', text: 'fertig / Tagesabschluss — durchgestrichen' },
  { status: 'cancelled', text: 'storniert — durchgestrichen' },
];

export const STRIP_LEGEND: ReadonlyArray<{ color: string; strike: boolean; text: string }> =
  LEGEND_STATUSES.map(({ status, text }) => {
    const style = stripStyle(status);
    return { color: style?.color ?? '#000', strike: style?.strike ?? false, text };
  });

export function stripStyle(status: BoardCase['status']): StripStyle | null {
  switch (status) {
    case 'in_progress':
      return { color: '#1976d2', strike: false, statusLabel: 'in Arbeit' };
    case 'issue_open':
      return { color: '#d32f2f', strike: false, statusLabel: 'Problem' };
    case 'problem_resolved':
      return { color: '#00897b', strike: false, statusLabel: 'geklärt' };
    case 'completed':
      return { color: '#2e7d32', strike: true, statusLabel: 'fertig' };
    case 'zst_done':
      return { color: '#2e7d32', strike: true, statusLabel: 'Tagesabschluss' };
    case 'cancelled':
      return { color: '#9e9e9e', strike: true, statusLabel: 'storniert' };
    default:
      return null;
  }
}
