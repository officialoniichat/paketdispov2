import { describe, expect, it } from 'vitest';
import type { BoardCase } from '../../data/types.js';
import { derivePacks, orderPackCases, stripStyle } from './matrixPacks.js';

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

describe('derivePacks', () => {
  it('gruppiert nach den Event-Packs und nummeriert chronologisch', () => {
    const cases = [bc('a', 'assigned'), bc('b', 'assigned'), bc('c', 'assigned')];
    const packs = derivePacks(cases, [
      ['a', 'b'],
      ['c'],
    ]);
    expect(packs.map((p) => p.label)).toEqual(['Pack 1', 'Pack 2']);
    expect(packs[0]!.cases.map((c) => c.caseId)).toEqual(['a', 'b']);
    expect(packs[1]!.cases.map((c) => c.caseId)).toEqual(['c']);
    expect(packs[0]!.teile).toBe(20);
  });

  it('ohne Pack-Daten: alle Belege als „Pack 1"', () => {
    const packs = derivePacks([bc('a', 'assigned'), bc('b', 'completed')], undefined);
    expect(packs).toHaveLength(1);
    expect(packs[0]!.label).toBe('Pack 1');
    expect(packs[0]!.cases).toHaveLength(2);
  });

  it('einsortierte Belege ERBEN das Pack ihrer Bündel-Nachbarn (kein Kasten daneben)', () => {
    // m wurde per Einsortieren zwischen a und b gesetzt (gleiches Bündel b1).
    const packs = derivePacks(
      [bc('a', 'assigned', 10, 'b1'), bc('m', 'assigned', 10, 'b1'), bc('b', 'assigned', 10, 'b1')],
      [['a', 'b']],
      'b1',
    );
    expect(packs).toHaveLength(1);
    expect(packs[0]!.cases.map((c) => c.caseId)).toEqual(['a', 'm', 'b']);
    expect(packs[0]!.teile).toBe(30);
  });

  it('vor dem ersten Pack-Mitglied einsortiert: erbt rückwärts vom nächsten Nachbarn', () => {
    const packs = derivePacks([bc('m', 'assigned', 10, 'b1'), bc('a', 'assigned', 10, 'b1')], [['a']], 'b1');
    expect(packs).toHaveLength(1);
    expect(packs[0]!.cases.map((c) => c.caseId)).toEqual(['m', 'a']);
  });

  it('Belege FREMDER Bündel (Soll bestehen) bilden je Bündel einen eigenen Manuell-Kasten', () => {
    const packs = derivePacks(
      [bc('a', 'assigned', 10, 'b1'), bc('m1', 'assigned', 10, 'b2'), bc('m2', 'assigned', 10, 'b3')],
      [['a']],
      'b1',
    );
    expect(packs.map((p) => p.label)).toEqual(['Pack 1', 'Manuell', 'Manuell']);
    expect(packs[1]!.cases.map((c) => c.caseId)).toEqual(['m1']);
    expect(packs[2]!.cases.map((c) => c.caseId)).toEqual(['m2']);
  });

  it('nennen mehrere Events denselben Beleg, gewinnt das spätere Pack (Wieder-Zuweisung)', () => {
    const packs = derivePacks([bc('a', 'assigned'), bc('b', 'assigned')], [
      ['a', 'b'],
      ['a'],
    ]);
    expect(packs.map((p) => p.cases.map((c) => c.caseId))).toEqual([['b'], ['a']]);
  });

  it('Events über Belege, die nicht (mehr) im Bündel sind, erzeugen keine leeren Packs', () => {
    const packs = derivePacks([bc('a', 'assigned')], [['weg'], ['a']]);
    expect(packs).toHaveLength(1);
    expect(packs[0]!.label).toBe('Pack 1');
    expect(packs[0]!.cases.map((c) => c.caseId)).toEqual(['a']);
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
