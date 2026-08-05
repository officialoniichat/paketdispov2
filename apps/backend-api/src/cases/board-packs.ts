/**
 * Pack-Rekonstruktion eines Bündels aus dem Audit-Log — SINGLE SOURCE für beides:
 * die Board-Anzeige (`BoardRowDto.packs`) und das Einsortieren beim manuellen
 * Verschieben (§8.4 `moveCase` mit Pack-Ziel).
 *
 * Ein „Pack" ist die Engine-Einheit der Tagesplanung (Starter-Pack + Folge-Packs,
 * Konfig starterPackMin/MaxTeile). Persistiert wird nur das FLACHE Bündel; die
 * Pack-Grenze lebt ausschließlich in den `bundle.created`/`bundle.extended`-Events.
 * Ein manuelles Verschieben MIT Pack-Ziel (`assignment.overridden`, action `moved`)
 * schreibt die Zugehörigkeit eines Belegs um — das chronologisch spätere Event
 * gewinnt, wie überall im Event-Log.
 *
 * Die Pack-Identität ist POSITIONELL (Index im zurückgegebenen Array). Damit ein
 * einmal vergebener Index stabil bleibt, wird ein Pack-Slot NIE entfernt, auch wenn
 * er durch Entziehen/Verschieben leer läuft — leere Slots erzeugen in der Anzeige
 * schlicht keinen Kasten.
 */

/** Das Nötigste eines WorkflowEvent für die Pack-Rekonstruktion (seq-aufsteigend). */
export interface PackSourceEvent {
  eventType: string;
  payload: unknown;
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function asCaseIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((id): id is string => typeof id === 'string');
}

/**
 * Baut die Pack-Zusammensetzung eines Bündels aus seinen Events. `memberCaseIds`
 * sind die Belege, die WIRKLICH noch im Bündel liegen — entzogene/weggeschobene
 * fallen damit automatisch aus ihrem Pack, ohne dass es dafür ein Gegen-Event
 * bräuchte.
 */
export function reconstructPacks(
  events: readonly PackSourceEvent[],
  memberCaseIds: readonly string[],
): string[][] {
  const members = new Set(memberCaseIds);
  const packs: string[][] = [];

  for (const event of events) {
    const payload = asRecord(event.payload);
    if (payload === null) continue;

    if (event.eventType === 'bundle.created' || event.eventType === 'bundle.extended') {
      const caseIds = asCaseIds(payload['caseIds']);
      // Kein/leeres caseIds-Feld = kein Pack-Event (defensiv); sonst entsteht der
      // Slot IMMER — auch wenn kein Mitglied mehr übrig ist (Index-Stabilität).
      if (caseIds === null || caseIds.length === 0) continue;
      packs.push(caseIds.filter((id) => members.has(id)));
      continue;
    }

    if (event.eventType !== 'assignment.overridden' || payload['action'] !== 'moved') continue;
    const caseId = payload['caseId'];
    if (typeof caseId !== 'string' || !members.has(caseId)) continue;
    // Beleg aus seinem bisherigen Pack lösen …
    for (const pack of packs) {
      const at = pack.indexOf(caseId);
      if (at >= 0) pack.splice(at, 1);
    }
    // … und ins Ziel-Pack einreihen. Ohne (oder mit ungültigem) Ziel bleibt er
    // pack-los und erbt in der Anzeige das Pack seines Nachbarn.
    const target = payload['targetPackIndex'];
    if (isPackIndex(target, packs.length)) packs[target]!.push(caseId);
  }

  return packs;
}

/** Gültiger Pack-Index für eine Pack-Liste dieser Länge. */
export function isPackIndex(value: unknown, packCount: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < packCount;
}

/**
 * Position, an der ein Beleg in die Abhol-Reihenfolge des Bündels gehört, damit er
 * beim Ziel-Pack liegt: direkt HINTER dem letzten Mitglied dieses Packs. Kennt das
 * Bündel den Beleg schon (Verschieben innerhalb desselben Bündels), muss er vorher
 * aus `orderedCaseIds` entfernt worden sein.
 */
export function packInsertPosition(
  orderedCaseIds: readonly string[],
  packMembers: readonly string[],
): number {
  const inPack = new Set(packMembers);
  let last = -1;
  for (const [index, caseId] of orderedCaseIds.entries()) {
    if (inPack.has(caseId)) last = index;
  }
  // Leeres Ziel-Pack (alle Mitglieder inzwischen weg): ans Ende — dort stört der
  // Beleg die Reihenfolge der übrigen Packs am wenigsten.
  return last < 0 ? orderedCaseIds.length : last + 1;
}
