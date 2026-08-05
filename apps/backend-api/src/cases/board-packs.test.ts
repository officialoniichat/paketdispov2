import { describe, expect, it } from 'vitest';
import {
  isPackIndex,
  packInsertPosition,
  reconstructPacks,
  type PackSourceEvent,
} from './board-packs.js';

const created = (...caseIds: string[]): PackSourceEvent => ({
  eventType: 'bundle.created',
  payload: { caseIds, effortPoints: 3 },
});
const extended = (...caseIds: string[]): PackSourceEvent => ({
  eventType: 'bundle.extended',
  payload: { caseIds, effortPoints: 2 },
});
const moved = (caseId: string, targetPackIndex: number | null): PackSourceEvent => ({
  eventType: 'assignment.overridden',
  payload: { action: 'moved', reason: null, caseId, targetPackIndex },
});

describe('reconstructPacks', () => {
  it('bildet Starter-Pack + Folge-Packs aus den Bündel-Events', () => {
    expect(reconstructPacks([created('a', 'b'), extended('c')], ['a', 'b', 'c'])).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });

  it('lässt Belege weg, die gar nicht mehr im Bündel liegen (entzogen/weggeschoben)', () => {
    // Quell-Bündel nach einem Verschieben von `b` zu einem anderen Mitarbeiter:
    // kein Gegen-Event nötig, die Mitgliedschaft entscheidet.
    expect(reconstructPacks([created('a', 'b'), extended('c')], ['a', 'c'])).toEqual([
      ['a'],
      ['c'],
    ]);
  });

  it('hält den Pack-Index stabil, auch wenn ein Pack ganz leer läuft', () => {
    // Pack 0 ist leer, Pack 1 muss Index 1 BLEIBEN — sonst zeigt ein gemerkter
    // targetPackIndex nach einem Entziehen plötzlich auf das falsche Pack.
    expect(reconstructPacks([created('a'), extended('b')], ['b'])).toEqual([[], ['b']]);
  });

  it('Verschieben mit Pack-Ziel schreibt die Zugehörigkeit um (spätere Events gewinnen)', () => {
    const events = [created('a', 'b'), extended('c'), moved('c', 0)];
    expect(reconstructPacks(events, ['a', 'b', 'c'])).toEqual([['a', 'b', 'c'], []]);
    // Zurück ins Folge-Pack: das jüngste Event zählt.
    expect(reconstructPacks([...events, moved('c', 1)], ['a', 'b', 'c'])).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });

  it('nimmt einen mitarbeiterübergreifend zugezogenen Beleg ins Ziel-Pack auf', () => {
    // `x` stammt aus einem fremden Bündel — kein created/extended nennt ihn hier.
    expect(
      reconstructPacks([created('a'), extended('b'), moved('x', 0)], ['a', 'b', 'x']),
    ).toEqual([['a', 'x'], ['b']]);
  });

  it('ohne (oder mit ungültigem) Pack-Ziel bleibt der Beleg pack-los — er erbt vom Nachbarn', () => {
    expect(reconstructPacks([created('a'), moved('x', null)], ['a', 'x'])).toEqual([['a']]);
    expect(reconstructPacks([created('a'), moved('x', 7)], ['a', 'x'])).toEqual([['a']]);
    expect(reconstructPacks([created('a'), moved('a', null)], ['a'])).toEqual([[]]);
  });

  it('ignoriert fremde Overrides und kaputte Payloads', () => {
    const noise: PackSourceEvent[] = [
      { eventType: 'assignment.overridden', payload: { action: 'withdraw', caseId: 'a' } },
      { eventType: 'assignment.overridden', payload: { action: 'reorder', caseIds: ['a'] } },
      { eventType: 'bundle.assigned', payload: { caseIds: ['zzz'] } },
      { eventType: 'bundle.extended', payload: null },
      { eventType: 'bundle.extended', payload: { caseIds: [] } },
    ];
    expect(reconstructPacks([created('a'), ...noise], ['a'])).toEqual([['a']]);
  });
});

describe('isPackIndex', () => {
  it('akzeptiert nur ganzzahlige Indizes innerhalb der Pack-Liste', () => {
    expect(isPackIndex(0, 2)).toBe(true);
    expect(isPackIndex(1, 2)).toBe(true);
    expect(isPackIndex(2, 2)).toBe(false);
    expect(isPackIndex(-1, 2)).toBe(false);
    expect(isPackIndex(0, 0)).toBe(false);
    expect(isPackIndex(1.5, 3)).toBe(false);
    expect(isPackIndex('1', 3)).toBe(false);
    expect(isPackIndex(undefined, 3)).toBe(false);
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
