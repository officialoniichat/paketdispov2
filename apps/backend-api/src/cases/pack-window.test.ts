import { describe, expect, it } from 'vitest';
import {
  hasPlannedFollowUpPack,
  lastPackIndex,
  packAdvanceBlockers,
  packCount,
  packInsertPosition,
  packMembers,
  packWindow,
  visibleCaseIds,
  type PackItem,
} from './pack-window.js';

function item(caseId: string, packIndex: number, status: string): PackItem {
  return { caseId, packIndex, status };
}

/** Pack 1 (aktiv) mit dem Problem-Beleg, Pack 2 vorgeplant — die Demo-Lage. */
const BUNDLE: PackItem[] = [
  item('p1-fertig', 0, 'completed'),
  item('p1-offen', 0, 'assigned'),
  item('p1-problem', 0, 'issue_open'),
  item('p2-a', 1, 'assigned'),
  item('p2-b', 1, 'assigned'),
];

describe('packWindow — was der Mitarbeiter sieht', () => {
  it('zeigt NUR das aktive Pack; vorgeplante Folge-Packs bleiben unsichtbar', () => {
    const window = packWindow(BUNDLE, 0);
    expect(window.activeCaseIds).toEqual(['p1-fertig', 'p1-offen', 'p1-problem']);
    expect(window.carriedOverCaseIds).toEqual([]);
    expect(visibleCaseIds(BUNDLE, 0).has('p2-a')).toBe(false);
  });

  it('nimmt offene Belege früherer Packs mit — sie bleiben nach dem Wechsel sichtbar', () => {
    const window = packWindow(BUNDLE, 1);
    expect(window.activeCaseIds).toEqual(['p2-a', 'p2-b']);
    // Der fertige Beleg aus Pack 1 ist weg, der Problem-Beleg bleibt.
    expect(window.carriedOverCaseIds).toEqual(['p1-offen', 'p1-problem']);
  });

  it('mitgenommene Belege bleiben sichtbar, wenn die Klärung eintrifft', () => {
    const geklaert = BUNDLE.map((i) =>
      i.caseId === 'p1-problem' ? item(i.caseId, i.packIndex, 'problem_resolved') : i,
    );
    expect(packWindow(geklaert, 1).carriedOverCaseIds).toContain('p1-problem');
  });

  it('abgeschlossene Mitnahmen verschwinden — auch aus einem früheren Pack', () => {
    const fertig = BUNDLE.map((i) =>
      i.packIndex === 0 ? item(i.caseId, i.packIndex, 'completed') : i,
    );
    expect(packWindow(fertig, 1).carriedOverCaseIds).toEqual([]);
  });
});

describe('packAdvanceBlockers — wann das nächste Pack freigegeben wird', () => {
  it('blockiert, solange im aktiven Pack eigene Arbeit offen ist', () => {
    expect(packAdvanceBlockers(BUNDLE, 0).map((i) => i.caseId)).toEqual(['p1-offen']);
  });

  it('ein Beleg mit OFFENEM Problem blockiert nicht — er wartet auf die Teamleitung', () => {
    const nurProblemOffen: PackItem[] = [
      item('a', 0, 'completed'),
      item('b', 0, 'zst_done'),
      item('c', 0, 'cancelled'),
      item('d', 0, 'issue_open'),
      item('e', 0, 'issue_open'),
    ];
    expect(packAdvanceBlockers(nurProblemOffen, 0)).toEqual([]);
  });

  it('ein GEKLÄRTER Beleg blockiert sehr wohl — den kann der Mitarbeiter abschließen', () => {
    const geklaert: PackItem[] = [item('a', 0, 'completed'), item('b', 0, 'problem_resolved')];
    expect(packAdvanceBlockers(geklaert, 0).map((i) => i.caseId)).toEqual(['b']);
  });

  it('mitgenommene Belege früherer Packs halten den Mitarbeiter kein zweites Mal fest', () => {
    const nachWechsel: PackItem[] = [
      item('p1-problem', 0, 'problem_resolved'),
      item('p2-a', 1, 'completed'),
    ];
    expect(packAdvanceBlockers(nachWechsel, 1)).toEqual([]);
  });
});

describe('Pack-Auskünfte', () => {
  it('zählt Packs und findet das letzte', () => {
    expect(lastPackIndex(BUNDLE)).toBe(1);
    expect(packCount(BUNDLE)).toBe(2);
    expect(packCount([])).toBe(0);
    expect(lastPackIndex([])).toBe(-1);
  });

  it('erkennt ein bereits vorgeplantes Folge-Pack', () => {
    expect(hasPlannedFollowUpPack(BUNDLE, 0)).toBe(true);
    expect(hasPlannedFollowUpPack(BUNDLE, 1)).toBe(false);
  });
});

describe('packMembers', () => {
  const items = [
    { caseId: 'a', packIndex: 0 },
    { caseId: 'b', packIndex: 1 },
    { caseId: 'c', packIndex: 0 },
  ];

  it('liefert die Belege eines Packs in Bündel-Reihenfolge', () => {
    expect(packMembers(items, 0)).toEqual(['a', 'c']);
    expect(packMembers(items, 1)).toEqual(['b']);
  });

  it('ein leergelaufenes Pack hat keine Mitglieder — bleibt aber ein gültiges Ziel', () => {
    // Pack 0 komplett weggeschoben: der Index existiert weiter (lastPackIndex = 1),
    // nur der Kasten im Board ist leer. Ein Drop darauf füllt ihn wieder.
    const drained = [{ caseId: 'b', packIndex: 1 }];
    expect(packMembers(drained, 0)).toEqual([]);
    expect(lastPackIndex(drained)).toBe(1);
  });
});

describe('packInsertPosition', () => {
  it('setzt den Beleg hinter das LETZTE Mitglied des Ziel-Packs', () => {
    expect(packInsertPosition(['a', 'b', 'c', 'd'], ['a', 'b'])).toBe(2);
    expect(packInsertPosition(['a', 'b', 'c', 'd'], ['c', 'd'])).toBe(4);
    expect(packInsertPosition(['a', 'b', 'c', 'd'], ['b'])).toBe(2);
  });

  it('leeres Ziel-Pack: ans Ende, damit die übrigen Packs zusammenbleiben', () => {
    expect(packInsertPosition(['a', 'b'], [])).toBe(2);
    expect(packInsertPosition([], ['x'])).toBe(0);
  });
});
