import { describe, expect, it } from 'vitest';
import type { LaneId } from '../../data/types.js';
import {
  ablagenDropAction,
  canWithdraw,
  matrixDropAction,
  packDropAction,
  type ExperimentDragPayload,
  type PackDropTarget,
} from './experimentDnd.js';

type AblageDrag = Extract<ExperimentDragPayload, { source: 'ablage' }>;
type MatrixDrag = Extract<ExperimentDragPayload, { source: 'matrix' }>;

function ablage(overrides: Partial<AblageDrag> = {}): AblageDrag {
  return {
    source: 'ablage',
    caseId: 'c1',
    weBelegNo: 'WE 1',
    status: 'ready',
    lane: 'sonstige',
    priorityFlags: [],
    forwardedTo: null,
    ...overrides,
  };
}

function matrix(overrides: Partial<MatrixDrag> = {}): MatrixDrag {
  return {
    source: 'matrix',
    caseId: 'c1',
    weBelegNo: 'WE 1',
    status: 'assigned',
    bundleId: 'b1',
    employeeId: 'emp1',
    employeeName: 'Anna',
    ...overrides,
  };
}

describe('ablagenDropAction', () => {
  it('ready → Geparkt = parken; geparkt → Sektions-Lane = entparken', () => {
    expect(ablagenDropAction(ablage(), 'geparkt')).toEqual({ kind: 'park' });
    expect(
      ablagenDropAction(ablage({ status: 'parked', lane: 'geparkt' }), 'jeden_tag'),
    ).toEqual({ kind: 'unpark' });
  });

  it('Prio: nur unpriorisierte ready-Belege hinein, nur manuelle Prio wieder heraus', () => {
    expect(ablagenDropAction(ablage(), 'prio')).toEqual({ kind: 'prioritise' });
    expect(ablagenDropAction(ablage({ priorityFlags: ['prio'] }), 'prio')).toBeNull();
    expect(
      ablagenDropAction(
        ablage({ lane: 'prio', priorityFlags: ['manual_teamlead_priority'] }),
        'sonstige',
      ),
    ).toEqual({ kind: 'deprioritise' });
    expect(
      ablagenDropAction(ablage({ lane: 'prio', priorityFlags: ['prio'] }), 'sonstige'),
    ).toBeNull();
  });

  it('Weiterleiten hinein, Zurückholen heraus', () => {
    expect(ablagenDropAction(ablage(), 'weitergeleitet')).toEqual({ kind: 'forward' });
    expect(
      ablagenDropAction(
        ablage({ lane: 'weitergeleitet', forwardedTo: 'retourenabteilung' }),
        'sonstige',
      ),
    ).toEqual({ kind: 'unforward' });
  });

  it('ungültige Ziele: gleiche Lane, Sektion↔Sektion, Verladeplan morgen, Problemfälle, Matrix-Drags', () => {
    expect(ablagenDropAction(ablage(), 'sonstige')).toBeNull();
    expect(ablagenDropAction(ablage({ lane: 'jeden_tag' }), 'verladeplan_heute')).toBeNull();
    expect(ablagenDropAction(ablage(), 'verladeplan_morgen')).toBeNull();
    expect(ablagenDropAction(ablage(), 'probleme')).toBeNull();
    const lanes: LaneId[] = ['geparkt', 'prio', 'sonstige'];
    for (const lane of lanes) {
      expect(ablagenDropAction(matrix(), lane)).toBeNull();
    }
  });
});

type VorschlagBundleDrag = Extract<ExperimentDragPayload, { source: 'vorschlag-bundle' }>;

function vorschlagBundle(overrides: Partial<VorschlagBundleDrag> = {}): VorschlagBundleDrag {
  return {
    source: 'vorschlag-bundle',
    slot: 0,
    caseIds: ['c1', 'c2'],
    teile: 55,
    allReady: true,
    ...overrides,
  };
}

describe('matrixDropAction', () => {
  it('Ablage-Drag: nur ready + nicht weitergeleitet = zuweisen', () => {
    expect(matrixDropAction(ablage(), 'emp2')).toEqual({ kind: 'assign' });
    expect(matrixDropAction(ablage({ status: 'parked' }), 'emp2')).toBeNull();
    expect(matrixDropAction(ablage({ forwardedTo: 'retourenabteilung' }), 'emp2')).toBeNull();
  });

  it('Vorschau-Bündel: komplett ready = assign-bundle, sonst kein Ziel', () => {
    expect(matrixDropAction(vorschlagBundle(), 'emp2')).toEqual({ kind: 'assign-bundle' });
    expect(matrixDropAction(vorschlagBundle({ allReady: false }), 'emp2')).toBeNull();
    expect(matrixDropAction(vorschlagBundle({ caseIds: [] }), 'emp2')).toBeNull();
    // Einzelne Vorschau-Zeile ordnet nur die Rückseite um — nie ein Matrix-Ziel.
    expect(
      matrixDropAction({ source: 'vorschlag', caseId: 'c1', weBelegNo: 'WE 1', slot: 0 }, 'emp2'),
    ).toBeNull();
    expect(ablagenDropAction(vorschlagBundle(), 'geparkt')).toBeNull();
  });

  it('Matrix-Drag: nur ungestartete Belege auf ANDERE Mitarbeiter = verschieben', () => {
    expect(matrixDropAction(matrix(), 'emp2')).toEqual({ kind: 'move' });
    // Die eigene Zeile ist kein Ziel — pack-genau entscheidet packDropAction.
    expect(matrixDropAction(matrix(), 'emp1')).toBeNull();
    expect(matrixDropAction(matrix({ status: 'in_progress' }), 'emp2')).toBeNull();
    expect(matrixDropAction(matrix({ bundleId: '' }), 'emp2')).toBeNull();
  });
});

describe('packDropAction', () => {
  const pack = (overrides: Partial<PackDropTarget> = {}): PackDropTarget => ({
    employeeId: 'emp1',
    index: 1,
    caseIds: ['c9'],
    absent: false,
    ...overrides,
  });

  it('hängt innerhalb DESSELBEN Mitarbeiters von Pack zu Pack um', () => {
    expect(packDropAction(matrix(), pack())).toEqual({ kind: 'move', targetPackIndex: 1 });
    expect(packDropAction(matrix(), pack({ index: 0 }))).toEqual({
      kind: 'move',
      targetPackIndex: 0,
    });
  });

  it('verschiebt mitarbeiterübergreifend in ein Ziel-Pack', () => {
    expect(packDropAction(matrix(), pack({ employeeId: 'emp2' }))).toEqual({
      kind: 'move',
      targetPackIndex: 1,
    });
  });

  it('laufende und fertige Belege sind unantastbar', () => {
    for (const status of ['in_progress', 'issue_open', 'problem_resolved', 'completed', 'zst_done', 'cancelled'] as const) {
      expect(packDropAction(matrix({ status }), pack())).toBeNull();
    }
    expect(packDropAction(matrix({ bundleId: '' }), pack())).toBeNull();
  });

  it('kein Ziel: eigenes Pack, abwesende Zeile, fremde Drag-Quellen', () => {
    expect(packDropAction(matrix(), pack({ caseIds: ['c9', 'c1'] }))).toBeNull();
    expect(packDropAction(matrix(), pack({ absent: true }))).toBeNull();
    expect(packDropAction(ablage(), pack())).toBeNull();
    expect(packDropAction(vorschlagBundle(), pack())).toBeNull();
    expect(packDropAction(null, pack())).toBeNull();
  });
});

describe('canWithdraw', () => {
  it('nur zugewiesene (ungestartete) Matrix-Drags dürfen entzogen werden', () => {
    expect(canWithdraw(matrix())).toBe(true);
    expect(canWithdraw(matrix({ status: 'in_progress' }))).toBe(false);
    expect(canWithdraw(ablage())).toBe(false);
    expect(canWithdraw(null)).toBe(false);
  });
});
