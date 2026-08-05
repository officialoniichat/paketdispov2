import { describe, expect, it } from 'vitest';
import type { BoardCase, BoardPack } from '../../data/types.js';
import { derivePacks, orderPackCases, packPullLabel, stripStyle } from './matrixPacks.js';

function bc(
  caseId: string,
  status: BoardCase['status'],
  totalQuantity = 10,
  bundleId?: string,
): BoardCase {
  return {
    caseId,
    weBelegNo: `WE-${caseId}`,
    status,
    totalQuantity,
    estimatedMinutes: 5,
    effortPoints: 5,
    storageCode: '',
    deliveryGroup: null,
    ...(bundleId !== undefined ? { bundleId } : {}),
  };
}

function pack(index: number, caseIds: string[], active = false): BoardPack {
  return { index, caseIds, active };
}

describe('derivePacks', () => {
  it('gruppiert nach den gelieferten Packs und nummeriert in Bündel-Reihenfolge', () => {
    const cases = [bc('a', 'assigned'), bc('b', 'assigned'), bc('c', 'assigned')];
    const packs = derivePacks(cases, [pack(0, ['a', 'b'], true), pack(1, ['c'])]);
    expect(packs.map((p) => p.label)).toEqual(['Pack 1', 'Pack 2']);
    expect(packs[0]!.cases.map((c) => c.caseId)).toEqual(['a', 'b']);
    expect(packs[1]!.cases.map((c) => c.caseId)).toEqual(['c']);
    expect(packs[0]!.teile).toBe(20);
  });

  it('markiert das aktive Pack — alle weiteren sind beim MA nur vorgeplant', () => {
    const packs = derivePacks(
      [bc('a', 'assigned'), bc('b', 'assigned')],
      [pack(0, ['a'], true), pack(1, ['b'])],
    );
    expect(packs.map((p) => p.active)).toEqual([true, false]);
  });

  it('ohne Pack-Daten: alle Belege als „Pack 1"', () => {
    const packs = derivePacks([bc('a', 'assigned'), bc('b', 'completed')], undefined);
    expect(packs).toHaveLength(1);
    expect(packs[0]!.label).toBe('Pack 1');
    expect(packs[0]!.cases).toHaveLength(2);
  });

  it('manuell einsortierte Belege stehen IM Pack, das sie mitliefert (kein Kasten daneben)', () => {
    // m wurde per Einsortieren ans Pack angehängt — das Backend liefert es mit.
    const packs = derivePacks(
      [bc('a', 'assigned', 10, 'b1'), bc('m', 'assigned', 10, 'b1'), bc('b', 'assigned', 10, 'b1')],
      [pack(0, ['a', 'm', 'b'], true)],
    );
    expect(packs).toHaveLength(1);
    expect(packs[0]!.cases.map((c) => c.caseId)).toEqual(['a', 'm', 'b']);
    expect(packs[0]!.teile).toBe(30);
  });

  it('Belege, die nicht (mehr) in der Zeile liegen, erzeugen keine leeren Packs', () => {
    const packs = derivePacks([bc('a', 'assigned')], [pack(0, ['weg']), pack(1, ['a'], true)]);
    expect(packs).toHaveLength(1);
    // Beschriftung zählt fortlaufend durch, der Index bleibt der persistierte —
    // sonst zielte ein Drop auf „Pack 1" plötzlich auf das leergelaufene Pack 0.
    expect(packs[0]!.label).toBe('Pack 1');
    expect(packs[0]!.index).toBe(1);
    expect(packs[0]!.cases.map((c) => c.caseId)).toEqual(['a']);
  });
});

describe('packPullLabel', () => {
  const packs = [
    { ...pack(0, ['a']), key: 'p0', label: 'Pack 1', cases: [], teile: 0 },
    { ...pack(1, ['b'], true), key: 'p1', label: 'Pack 2', cases: [], teile: 0 },
    { ...pack(2, ['c']), key: 'p2', label: 'Pack 3', cases: [], teile: 0 },
  ];

  it('unterscheidet abgearbeitet / aktiv / vorgeplant am aktiven Pack', () => {
    expect(packPullLabel(packs[0]!, packs)).toBe('abgearbeitet');
    expect(packPullLabel(packs[1]!, packs)).toBe('aktiv beim MA');
    expect(packPullLabel(packs[2]!, packs)).toBe('vorgeplant');
  });

  it('bei einem einzigen Pack gibt es nichts zu unterscheiden', () => {
    expect(packPullLabel(packs[1]!, [packs[1]!])).toBeNull();
  });
});

describe('orderPackCases', () => {
  it('der Beleg in Arbeit liegt oben, Fertige unten — stabil innerhalb der Ränge', () => {
    const ordered = orderPackCases([
      bc('fertig', 'completed'),
      bc('plan1', 'assigned'),
      bc('aktiv', 'in_progress'),
      bc('plan2', 'assigned'),
      bc('problem', 'issue_open'),
    ]);
    expect(ordered.map((c) => c.caseId)).toEqual(['aktiv', 'problem', 'plan1', 'plan2', 'fertig']);
  });
});

describe('stripStyle', () => {
  it('blau = in Arbeit, rot = Problem, grün + durchgestrichen = fertig', () => {
    expect(stripStyle('in_progress')).toEqual({
      color: '#1976d2',
      strike: false,
      statusLabel: 'in Arbeit',
    });
    expect(stripStyle('issue_open')?.color).toBe('#d32f2f');
    expect(stripStyle('completed')).toEqual({
      color: '#2e7d32',
      strike: true,
      statusLabel: 'fertig',
    });
  });

  it('geplante Belege liefern null (erben die Lieferungs-Gruppenfarbe)', () => {
    expect(stripStyle('assigned')).toBeNull();
    expect(stripStyle('ready')).toBeNull();
  });
});
