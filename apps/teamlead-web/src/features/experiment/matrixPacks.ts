/**
 * Experiment DA.M.B — Pack-Ableitung für die Mitarbeiter-Matrix (reine Anzeige).
 *
 * Ein „Pack" ist die Engine-Einheit der Tagesplanung (Starter-Pack + Folge-
 * Packs, Konfig starterPackMin/MaxTeile). Mehrere Packs werden flach in EIN
 * Bündel gemerged; die Pack-Grenze ist persistiert (`AssignmentItem.packIndex`)
 * und kommt fertig vom Board-Endpoint (BoardRow.packs) — inklusive der Angabe,
 * welches Pack beim Mitarbeiter gerade aktiv ist. Hier wird nur gruppiert und
 * für die Anzeige geordnet — keine Fachlogik.
 */
import type { BoardCase, BoardPack } from '../../data/types.js';

export interface MatrixPack {
  key: string;
  label: string;
  /**
   * Pack-Index im Bündel — DERSELBE persistierte Index, den `BoardRowDto.packs`
   * liefert und den `moveCase` als `targetPackIndex` erwartet. Jeder Beleg eines
   * Bündels gehört genau einem Pack, es gibt also keinen pack-losen Sammelkasten
   * mehr: jeder Kasten ist ein gültiges Drop-Ziel.
   *
   * Nicht mit der Beschriftung verwechseln: läuft ein Pack leer, verschwindet sein
   * Kasten und die Nummerierung im `label` schließt die Lücke — `index` nicht.
   */
  index: number;
  /** Belege des Packs, anzeige-geordnet (Laufendes oben, Fertiges unten). */
  cases: BoardCase[];
  teile: number;
  /**
   * Das Pack, an dem der Mitarbeiter GERADE arbeitet — nur dessen Belege sieht
   * er in seiner App (Pull-Prinzip). Alle späteren sind vorgeplant und dort
   * noch unsichtbar.
   */
  active: boolean;
}

/** Status, die im Pack als „Laufend" gelten (oberster Abschnitt des Containers). */
export const LAUFEND_STATUSES: ReadonlyArray<BoardCase['status']> = [
  'in_progress',
  'issue_open',
  'problem_resolved',
];

/** Fertig-Status (grün, durchgestrichen) — unterster Abschnitt des Containers. */
export const FERTIG_STATUSES: ReadonlyArray<BoardCase['status']> = [
  'completed',
  'zst_done',
  'cancelled',
];

/** Anzeige-Rang: Laufendes oben (blau/rot), Geplantes mittig, Fertiges unten. */
function displayRank(status: BoardCase['status']): number {
  if (LAUFEND_STATUSES.includes(status)) return 0;
  return FERTIG_STATUSES.includes(status) ? 2 : 1;
}

/** Abschnitt eines Pack-Containers — die Aufteilung der Board-Karte im Kleinen. */
export interface PackSection {
  key: 'laufend' | 'geplant' | 'fertig';
  title: string;
  cases: BoardCase[];
  /** Text bei leerem Abschnitt; null = Abschnitt wird bei Leere ganz weggelassen. */
  empty: string | null;
}

/**
 * Teilt die Belege EINES Packs auf wie die Karte des Mitarbeiterboards:
 * „Laufend (n)" / „Geplant (n)" / „Fertig (n)". Laufend und Geplant erscheinen
 * immer (mit dem Leertext des Boards), Fertig nur, wenn etwas fertig ist.
 */
export function packSections(cases: readonly BoardCase[]): PackSection[] {
  const laufend = cases.filter((c) => LAUFEND_STATUSES.includes(c.status));
  const fertig = cases.filter((c) => FERTIG_STATUSES.includes(c.status));
  const geplant = cases.filter(
    (c) => !LAUFEND_STATUSES.includes(c.status) && !FERTIG_STATUSES.includes(c.status),
  );
  const sections: PackSection[] = [
    {
      key: 'laufend',
      title: `Laufend (${laufend.length})`,
      cases: laufend,
      empty: 'Nichts in Arbeit.',
    },
    {
      key: 'geplant',
      title: `Geplant (${geplant.length})`,
      cases: geplant,
      empty: 'Nichts geplant.',
    },
  ];
  if (fertig.length > 0) {
    sections.push({ key: 'fertig', title: `Fertig (${fertig.length})`, cases: fertig, empty: null });
  }
  return sections;
}

/** Stabil sortiert: der Beleg in Arbeit (blau) oben, Fertige (grün) unten. */
export function orderPackCases(cases: readonly BoardCase[]): BoardCase[] {
  return [...cases].sort((a, b) => displayRank(a.status) - displayRank(b.status));
}

/**
 * Gruppiert die Bündel-Belege einer Zeile in ihre Packs. Die Zuordnung kommt
 * vollständig vom Backend (persistierter `packIndex`) — auch manuell zugewiesene
 * oder einsortierte Belege tragen eines, sie hängen sich ans letzte Pack ihres
 * Bündels. Hier wird deshalb nichts mehr geraten oder vererbt: Packs in
 * gelieferter Reihenfolge durchnummerieren, Belege daraus nachschlagen, fertig.
 *
 * Ohne Pack-Angabe (schlanke Test-Fixtures) läuft die Zeile als EIN „Pack 1".
 */
export function derivePacks(
  cases: readonly BoardCase[],
  packs: readonly BoardPack[] | undefined,
): MatrixPack[] {
  const byId = new Map(cases.map((c) => [c.caseId, c]));
  const groups = (packs ?? [])
    .map((pack) => ({
      index: pack.index,
      active: pack.active,
      members: pack.caseIds
        .map((id) => byId.get(id))
        .filter((c): c is BoardCase => c !== undefined),
    }))
    // Belege, die nicht (mehr) in der Zeile liegen, erzeugen keinen leeren Kasten.
    .filter((g) => g.members.length > 0);

  if (groups.length === 0 && cases.length > 0) {
    groups.push({ index: 0, active: true, members: [...cases] });
  }

  // `key`/`index` tragen den persistierten Pack-Index (Drop-Ziel, stabil), die
  // Beschriftung zählt fortlaufend durch — ein leergelaufenes Pack hinterlässt
  // beim Teamlead also keine Lücke in der Nummerierung.
  return groups.map((g, displayIndex) => ({
    key: `pack-${g.index}`,
    label: `Pack ${displayIndex + 1}`,
    index: g.index,
    active: g.active,
    cases: orderPackCases(g.members),
    teile: g.members.reduce((sum, c) => sum + c.totalQuantity, 0),
  }));
}

/**
 * Wo steht dieses Pack im Pull-Ablauf des Mitarbeiters? In seiner App sieht er NUR
 * sein aktives Pack — der Teamlead soll hier ablesen können, was davon beim MA
 * schon durch ist, was er gerade vor sich hat und was er noch nicht sieht.
 *
 * `null` bei einem einzigen Pack: dann gibt es nichts zu unterscheiden, und die
 * Zeile bleibt ruhig.
 */
export function packPullLabel(
  pack: MatrixPack,
  packs: readonly MatrixPack[],
): 'abgearbeitet' | 'aktiv beim MA' | 'vorgeplant' | null {
  if (packs.length < 2) return null;
  if (pack.active) return 'aktiv beim MA';
  const activeIndex = packs.find((p) => p.active)?.index;
  if (activeIndex === undefined) return null;
  return pack.index < activeIndex ? 'abgearbeitet' : 'vorgeplant';
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
