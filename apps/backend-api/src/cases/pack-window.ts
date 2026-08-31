/**
 * Pack-Fachlogik — single source für alles, was ein „Pack" ausmacht: wer wohin
 * gehört, was der Mitarbeiter davon sieht, und wann er weiterziehen darf.
 *
 * Ein „Pack" ist die Arbeitseinheit der Engine (Starter-Pack, dann Folge-Packs).
 * Mehrere Packs werden FLACH in ein Bündel gemerged; die Grenze trägt
 * `AssignmentItem.packIndex`, das aktuell bearbeitete Pack
 * `AssignmentBundle.activePackIndex`. Beides ist PERSISTIERT: die
 * Pack-Zugehörigkeit ist damit eine abfragbare Tatsache und kein aus dem
 * Audit-Log nachgespielter Verlauf — nur so kann sie Sichtbarkeit entscheiden,
 * denn „sichtbar" kennt kein Vielleicht.
 *
 * Der Mitarbeiter arbeitet strikt pull-basiert: er sieht ausschließlich sein
 * AKTIVES Pack. Für kommende Packs vorgeplante Belege sind in der Mitarbeiter-App
 * nirgends sichtbar — weder unter „Ware holen" noch unter „Bearbeiten" — bis er
 * das nächste Pack anfordert. Die Entscheidung fällt hier im Backend; die UIs
 * zeigen sie nur an.
 *
 * Zwei Ausnahmen halten den Fluss am Laufen, beide rund um Problem-Belege:
 *
 *  - {@link packAdvanceBlockers} — ein Beleg mit noch OFFENEM Problem (gemeldet,
 *    keine Klärung/Instruktion) kann vom Mitarbeiter nicht abgeschlossen werden.
 *    Er darf den Wechsel aufs nächste Pack deshalb nicht blockieren, sonst stünde
 *    der Mitarbeiter bis zur Klärung durch die Teamleitung still.
 *  - {@link packWindow} — genau diese Belege bleiben nach dem Wechsel SICHTBAR
 *    (Anzeige-Mitnahme), auch wenn die Klärung erst später eintrifft, damit der
 *    Mitarbeiter sie noch abschließen kann. Fachlich bleiben sie ihrem
 *    ursprünglichen Pack zugeordnet: `packIndex` wird NICHT umgebucht, ihr
 *    Abschluss zählt weiter auf das alte Pack.
 */

/** Terminale Case-Status: der Beleg ist für den Mitarbeiter erledigt. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'zst_done', 'cancelled']);

/**
 * Offenes Problem: gemeldet, aber noch nicht geklärt/instruiert. Der Mitarbeiter
 * wartet auf die Teamleitung und kann den Beleg nicht weiterbearbeiten.
 * `problem_resolved` (geklärt) ist bewusst NICHT eingeschlossen — der Beleg ist
 * wieder bearbeitbar und damit Teil des Soll-Pensums seines Packs.
 */
const UNRESOLVED_ISSUE_STATUS = 'issue_open';

/** Ein Bündel-Item, reduziert auf das, was das Pack-Fenster entscheidet. */
export interface PackItem {
  caseId: string;
  packIndex: number;
  status: string;
  /**
   * Geteilter Beleg (Konzept beleg-zusammenarbeit §3.8): die EIGENE Beteiligung
   * des Anfragenden ist `teil_erledigt` — sein Anteil ist fertig, die anderen
   * arbeiten weiter. Der Beleg blockiert den Pack-Wechsel dann nicht mehr.
   */
  ownPartDone?: boolean;
}

/** Fertig für den Mitarbeiter — completed/zst_done/cancelled. */
export function isTerminalCaseStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Wartet auf die Klärung durch die Teamleitung (nicht abschließbar). */
export function hasUnresolvedIssue(status: string): boolean {
  return status === UNRESOLVED_ISSUE_STATUS;
}

/**
 * Belege des AKTIVEN Packs, die den Wechsel aufs nächste Pack blockieren: alles,
 * was der Mitarbeiter noch selbst erledigen kann (assigned, in_progress,
 * problem_resolved …). Ein Beleg mit offenem Problem zählt NICHT dazu — der hängt
 * an der Teamleitung, nicht am Mitarbeiter (Pull-Ausnahme).
 *
 * Belege früherer Packs (die Anzeige-Mitnahme) blockieren ebenfalls nie: ihre
 * Ausnahme wurde beim letzten Wechsel bereits gewährt, sie dürfen den Mitarbeiter
 * nicht ein zweites Mal festhalten.
 *
 * Dritte Ausnahme (geteilter Beleg, §3.8): ist die EIGENE Beteiligung des
 * Anfragenden `teil_erledigt`, hält ihn der Beleg nicht fest — sein Anteil ist
 * erledigt, den Rest arbeiten die anderen Beteiligten ab. Ob er trotzdem
 * mithelfen muss, entscheidet die Admin-Regel `shared_case_open` — nicht dieses
 * Fenster.
 */
export function packAdvanceBlockers(
  items: readonly PackItem[],
  activePackIndex: number,
): PackItem[] {
  return items.filter(
    (i) =>
      i.packIndex === activePackIndex &&
      !isTerminalCaseStatus(i.status) &&
      !hasUnresolvedIssue(i.status) &&
      i.ownPartDone !== true,
  );
}

/** Nur die Pack-Zugehörigkeit — für Auskünfte, die den Case-Status nicht brauchen. */
type PackMember = { packIndex: number };

/** Der höchste vorhandene Pack-Index eines Bündels; -1 wenn es keine Items gibt. */
export function lastPackIndex(items: readonly PackMember[]): number {
  return items.reduce((max, i) => Math.max(max, i.packIndex), -1);
}

/**
 * Anzahl der tatsächlich vorhandenen Packs eines Bündels (distinct packIndex,
 * leeres Bündel = 0). Lücken-fest: läuft ein Pack durch Entziehen/Umplanen leer,
 * schrumpft die Anzahl — die persistierten Indizes der übrigen bleiben unberührt.
 */
export function packCount(items: readonly PackMember[]): number {
  return new Set(items.map((i) => i.packIndex)).size;
}

/**
 * Ordinale Anzeige-Position eines Packs („Pack N von M"): 1-basiert in der
 * sortierten Liste der vorhandenen Pack-Indizes. Der gefragte Index zählt sich
 * selbst dazu, falls sein Pack leergelaufen ist — sonst zeigte die Anzeige „Pack 0".
 */
export function packOrdinal(items: readonly PackMember[], packIndex: number): number {
  const distinct = new Set(items.map((i) => i.packIndex));
  distinct.add(packIndex);
  return [...distinct].sort((a, b) => a - b).indexOf(packIndex) + 1;
}

/** Gibt es hinter dem aktiven Pack ein bereits vorgeplantes weiteres Pack? */
export function hasPlannedFollowUpPack(
  items: readonly PackMember[],
  activePackIndex: number,
): boolean {
  return items.some((i) => i.packIndex > activePackIndex);
}

export interface PackWindow {
  /** Belege des aktiven Packs — das Soll-Pensum, auf das alle Zähler laufen. */
  activeCaseIds: string[];
  /**
   * Anzeige-Mitnahme: noch offene Belege FRÜHERER Packs (Problemfälle, die der
   * Mitarbeiter beim Wechsel nicht abschließen konnte). Sie bleiben sichtbar,
   * bis sie fertig sind — fachlich gehören sie weiter ihrem alten Pack.
   */
  carriedOverCaseIds: string[];
}

/**
 * Das Sichtfenster der Mitarbeiter-App: aktives Pack + Anzeige-Mitnahme.
 * Alles andere (kommende Packs) existiert für den Mitarbeiter nicht.
 */
export function packWindow(items: readonly PackItem[], activePackIndex: number): PackWindow {
  const activeCaseIds: string[] = [];
  const carriedOverCaseIds: string[] = [];
  for (const item of items) {
    if (item.packIndex === activePackIndex) {
      activeCaseIds.push(item.caseId);
    } else if (item.packIndex < activePackIndex && !isTerminalCaseStatus(item.status)) {
      carriedOverCaseIds.push(item.caseId);
    }
  }
  return { activeCaseIds, carriedOverCaseIds };
}

/** Sichtbare Belege des Fensters als Menge — aktives Pack + Mitnahme. */
export function visibleCaseIds(items: readonly PackItem[], activePackIndex: number): Set<string> {
  const window = packWindow(items, activePackIndex);
  return new Set([...window.activeCaseIds, ...window.carriedOverCaseIds]);
}

/**
 * Die Belege eines Packs, in Bündel-Reihenfolge. Leer, wenn das Pack durch
 * Verschieben/Entziehen leergelaufen ist — der Index bleibt trotzdem gültig,
 * solange er nicht über {@link lastPackIndex} hinausgeht.
 */
export function packMembers(
  items: readonly { caseId: string; packIndex: number }[],
  packIndex: number,
): string[] {
  return items.filter((i) => i.packIndex === packIndex).map((i) => i.caseId);
}

/**
 * Position, an der ein Beleg in die Abhol-Reihenfolge des Bündels gehört, damit er
 * beim Ziel-Pack liegt: direkt HINTER dem letzten Mitglied dieses Packs. Kennt das
 * Bündel den Beleg schon (Verschieben innerhalb desselben Bündels), muss er vorher
 * aus `orderedCaseIds` entfernt worden sein.
 */
export function packInsertPosition(
  orderedCaseIds: readonly string[],
  members: readonly string[],
): number {
  const inPack = new Set(members);
  let last = -1;
  for (const [index, caseId] of orderedCaseIds.entries()) {
    if (inPack.has(caseId)) last = index;
  }
  // Leeres Ziel-Pack (alle Mitglieder inzwischen weg): ans Ende — dort stört der
  // Beleg die Reihenfolge der übrigen Packs am wenigsten.
  return last < 0 ? orderedCaseIds.length : last + 1;
}
