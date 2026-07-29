import { describe, expect, it } from 'vitest';
import type { BoardCase, BoardRow } from '../../data/types.js';
import {
  filterBoardRows,
  partitionBoardCases,
  phaseOf,
  reorderForDrop,
  sortBoardRows,
} from './kanbanOrder.js';

function bc(caseId: string, status: BoardCase['status']): BoardCase {
  return {
    caseId,
    weBelegNo: `WE-${caseId}`,
    status,
    totalQuantity: 10,
    estimatedMinutes: 12,
    effortPoints: 3,
    storageCode: 'R13',
    deliveryGroup: null,
  };
}

describe('phaseOf', () => {
  it('ordnet Bearbeitungs- und Problem-Status dem Abschnitt „laufend" zu', () => {
    expect(phaseOf('in_progress')).toBe('laufend');
    expect(phaseOf('issue_open')).toBe('laufend');
    expect(phaseOf('problem_resolved')).toBe('laufend');
    expect(phaseOf('assigned')).toBe('geplant');
    expect(phaseOf('completed')).toBe('fertig');
    expect(phaseOf('zst_done')).toBe('fertig');
  });
});

describe('partitionBoardCases', () => {
  it('verteilt in Abholreihenfolge auf laufend/geplant/fertig', () => {
    const cases = [
      bc('k1', 'in_progress'),
      bc('k2', 'assigned'),
      bc('k3', 'completed'),
      bc('k4', 'assigned'),
    ];
    const p = partitionBoardCases(cases);
    expect(p.laufend.map((c) => c.caseId)).toEqual(['k1']);
    expect(p.geplant.map((c) => c.caseId)).toEqual(['k2', 'k4']);
    expect(p.fertig.map((c) => c.caseId)).toEqual(['k3']);
  });
});

describe('reorderForDrop', () => {
  const cases = [
    bc('k1', 'in_progress'),
    bc('k2', 'assigned'),
    bc('k3', 'assigned'),
    bc('k4', 'completed'),
  ];

  it('Zone „laufend" zieht einen geplanten Beleg als Nächstes vor', () => {
    expect(reorderForDrop(cases, 'k3', { kind: 'zone', phase: 'laufend' })).toEqual([
      'k1',
      'k3',
      'k2',
      'k4',
    ]);
  });

  it('Zone „geplant" sortiert ans Ende der Geplanten (vor Fertige)', () => {
    expect(reorderForDrop(cases, 'k2', { kind: 'zone', phase: 'geplant' })).toEqual([
      'k1',
      'k3',
      'k2',
      'k4',
    ]);
  });

  it('„before" sortiert unmittelbar vor den Ziel-Beleg', () => {
    expect(reorderForDrop(cases, 'k3', { kind: 'before', caseId: 'k2' })).toEqual([
      'k1',
      'k3',
      'k2',
      'k4',
    ]);
  });

  it('liefert null, wenn der Drop nichts ändert', () => {
    expect(reorderForDrop(cases, 'k3', { kind: 'zone', phase: 'geplant' })).toBeNull();
    expect(reorderForDrop(cases, 'k2', { kind: 'zone', phase: 'laufend' })).toBeNull();
  });

  it('liefert null für laufende/fertige/unbekannte Belege und ungültige Ziele', () => {
    expect(reorderForDrop(cases, 'k1', { kind: 'zone', phase: 'geplant' })).toBeNull();
    expect(reorderForDrop(cases, 'k4', { kind: 'zone', phase: 'laufend' })).toBeNull();
    expect(reorderForDrop(cases, 'nope', { kind: 'zone', phase: 'laufend' })).toBeNull();
    expect(reorderForDrop(cases, 'k2', { kind: 'before', caseId: 'k2' })).toBeNull();
    expect(reorderForDrop(cases, 'k2', { kind: 'before', caseId: 'k4' })).toBeNull();
    expect(reorderForDrop(cases, 'k2', { kind: 'before', caseId: 'k1' })).toBeNull();
  });
});

function br(
  employeeId: string,
  skillTier: BoardRow['skillTier'],
  plannedTeile: number,
  utilisationPct: number,
): BoardRow {
  return {
    employeeId,
    displayName: employeeId,
    skillTier,
    plannedTeile,
    plannedHours: 0,
    utilisationPct,
    assignedMinutes: plannedTeile,
    netCapacityMinutes: 271,
    effortPoints: 0,
    openIssues: 0,
    paused: false,
    bereiche: [],
    cases: [],
  };
}

describe('sortBoardRows / filterBoardRows', () => {
  const rows = [br('a', 'basis', 225, 31), br('b', 'profi', 0, 0), br('c', 'starter', 180, 40)];

  it('„frei"/„voll" sortiert Teile-first (B3), nicht nach Kapazitäts-Prozent', () => {
    expect(sortBoardRows(rows, 'frei').map((r) => r.employeeId)).toEqual(['b', 'c', 'a']);
    // c hat den höheren %-Wert (kleine Kapazität), aber a die meisten Teile → a zuerst.
    expect(sortBoardRows(rows, 'voll').map((r) => r.employeeId)).toEqual(['a', 'c', 'b']);
  });

  it('gleiche Teile: Minuten und dann %-Auslastung entscheiden', () => {
    const tied = [br('x', 'basis', 100, 20), br('y', 'basis', 100, 60)];
    expect(sortBoardRows(tied, 'voll').map((r) => r.employeeId)).toEqual(['y', 'x']);
  });

  it('„erfahrung" sortiert Profi zuerst; „standard" behält die Reihenfolge', () => {
    expect(sortBoardRows(rows, 'erfahrung').map((r) => r.employeeId)).toEqual(['b', 'a', 'c']);
    expect(sortBoardRows(rows, 'erfahrung_auf').map((r) => r.employeeId)).toEqual(['c', 'a', 'b']);
    expect(sortBoardRows(rows, 'standard').map((r) => r.employeeId)).toEqual(['a', 'b', 'c']);
  });

  it('filtert nach Erfahrungsstufen; leere Auswahl zeigt alle', () => {
    expect(filterBoardRows(rows, ['profi']).map((r) => r.employeeId)).toEqual(['b']);
    expect(filterBoardRows(rows, ['basis', 'starter']).map((r) => r.employeeId)).toEqual(['a', 'c']);
    expect(filterBoardRows(rows, []).map((r) => r.employeeId)).toEqual(['a', 'b', 'c']);
  });
});
