import { describe, expect, it } from 'vitest';
import type { LaneId } from '../../data/types.js';
import {
  ablagenDropAction,
  canWithdraw,
  matrixDropAction,
  type ExperimentDragPayload,
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

describe('matrixDropAction', () => {
  it('Ablage-Drag: nur ready + nicht weitergeleitet = zuweisen', () => {
    expect(matrixDropAction(ablage(), 'emp2')).toEqual({ kind: 'assign' });
    expect(matrixDropAction(ablage({ status: 'parked' }), 'emp2')).toBeNull();
    expect(matrixDropAction(ablage({ forwardedTo: 'retourenabteilung' }), 'emp2')).toBeNull();
  });

  it('Matrix-Drag: nur ungestartete Belege auf ANDERE Mitarbeiter = verschieben', () => {
    expect(matrixDropAction(matrix(), 'emp2')).toEqual({ kind: 'move' });
    expect(matrixDropAction(matrix(), 'emp1')).toBeNull();
    expect(matrixDropAction(matrix({ status: 'in_progress' }), 'emp2')).toBeNull();
    expect(matrixDropAction(matrix({ bundleId: '' }), 'emp2')).toBeNull();
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
