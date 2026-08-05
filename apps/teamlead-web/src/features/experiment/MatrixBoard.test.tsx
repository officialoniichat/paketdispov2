import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, createQueryClient } from '@paket/ui';
import type { BoardCase, BoardRow } from '../../data/types.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { MatrixBoard } from './MatrixBoard.js';
import { packSections } from './matrixPacks.js';
import type { ExperimentDragPayload } from './experimentDnd.js';

const mocks = vi.hoisted(() => {
  const mutation = (): {
    mutate: ReturnType<typeof vi.fn>;
    isError: boolean;
    error: null;
    reset: ReturnType<typeof vi.fn>;
  } => ({
    mutate: vi.fn(),
    isError: false,
    error: null,
    reset: vi.fn(),
  });
  return { assignToEmployee: mutation(), moveCase: mutation(), pauseResume: mutation() };
});
vi.mock('../../data/store.js', () => ({ useCockpitData: () => mocks }));
// Schnellinfo der Beleg-Striche: die Kopf-Daten kommen lazy aus fetchBelegDetail.
vi.mock('../../data/belege.js', () => ({
  fetchBelegDetail: vi.fn(async () => ({
    branchNo: '001',
    deliveryNoteNo: 'LS-2026-000302',
    goodsType: 'NOS_Nachorder',
    bookingDate: '2026-07-29T00:00:00.000Z',
    positions: [],
    assignedEmployeeName: 'Bernd Voss',
    hasOpenIssue: false,
    attentionFlag: false,
    attentionNote: null,
  })),
}));

function bc(
  caseId: string,
  status: BoardCase['status'],
  deliveryGroup: BoardCase['deliveryGroup'] = null,
): BoardCase {
  return {
    caseId,
    weBelegNo: `WE-${caseId}`,
    status,
    totalQuantity: 10,
    estimatedMinutes: 6,
    effortPoints: 5,
    storageCode: '',
    deliveryGroup,
  };
}

/** 2er-Lieferung (1 fehlt) — treibt die Zugehörigkeits-Zeile der Striche. */
const GROUP: BoardCase['deliveryGroup'] = {
  id: 'g1',
  label: 'LS-77',
  signal: 'note',
  confidence: 'likely',
  presentSize: 2,
  expectedSize: 3,
  missingCount: 1,
  locked: false,
  released: false,
};

/**
 * `packs` als reine caseId-Listen: der persistierte Pack-Index ist hier die
 * Position, das erste Pack gilt als das beim MA aktive — genau die Form, in der
 * das Board sie ausliefert.
 */
function row(
  employeeId: string,
  displayName: string,
  cases: BoardCase[],
  packs?: string[][],
): BoardRow {
  return {
    employeeId,
    displayName,
    skillTier: 'basis',
    plannedTeile: cases.reduce((s, c) => s + c.totalQuantity, 0),
    plannedHours: 4,
    utilisationPct: 30,
    assignedMinutes: 60,
    netCapacityMinutes: 200,
    effortPoints: 0,
    openIssues: 0,
    bundleId: cases.length > 0 ? `b-${employeeId}` : undefined,
    paused: false,
    bereiche: [],
    cases,
    packs: packs?.map((caseIds, index) => ({ index, caseIds, active: index === 0 })),
  };
}

const BOARD: BoardRow[] = [
  row('emp1', 'Anna Berger', [bc('k1', 'in_progress'), bc('k2', 'assigned', GROUP)], [
    ['k1', 'k2'],
  ]),
  row('emp2', 'Bernd Voss', []),
];

function dt(): {
  effectAllowed: string;
  dropEffect: string;
  setData: ReturnType<typeof vi.fn>;
  getData: ReturnType<typeof vi.fn>;
} {
  return { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn(() => '') };
}

const ablageDrag: ExperimentDragPayload = {
  source: 'ablage',
  caseId: 'c9',
  weBelegNo: 'WE 900',
  status: 'ready',
  lane: 'sonstige',
  priorityFlags: [],
  forwardedTo: null,
};

/**
 * Zwei Packs bei Anna (Starter-Pack + Folge-Pack) und ein Bündel bei Bernd —
 * die Grundlage fürs Umhängen INNERHALB eines Mitarbeiters und darüber hinweg.
 */
const ZWEI_PACKS: BoardRow[] = [
  row(
    'emp1',
    'Anna Berger',
    [bc('k1', 'in_progress'), bc('k2', 'assigned'), bc('k3', 'assigned')],
    [
      ['k1', 'k2'],
      ['k3'],
    ],
  ),
  row('emp2', 'Bernd Voss', [bc('k7', 'assigned')], [['k7']]),
];

/** Gezogener Beleg k2 aus Pack 1 von Anna (ungestartet, also verschiebbar). */
const matrixDragK2: ExperimentDragPayload = {
  source: 'matrix',
  caseId: 'k2',
  weBelegNo: 'WE-k2',
  status: 'assigned',
  bundleId: 'b-emp1',
  employeeId: 'emp1',
  employeeName: 'Anna Berger',
};

function renderMatrix(
  dragging: ExperimentDragPayload | null,
  board: BoardRow[] = BOARD,
): {
  requestReason: ReturnType<typeof vi.fn>;
  onDragStart: ReturnType<typeof vi.fn>;
} {
  const requestReason = vi.fn();
  const onDragStart = vi.fn();
  render(
    <AppProviders queryClient={createQueryClient({ retry: 0 })}>
      <MemoryRouter>
        <MatrixBoard
          board={board}
          groupColorById={new Map()}
          dragging={dragging}
          onDragStart={onDragStart}
          onDragEnd={vi.fn()}
          requestReason={requestReason}
        />
      </MemoryRouter>
    </AppProviders>,
  );
  return { requestReason, onDragStart };
}

beforeEach(() => {
  mocks.assignToEmployee.mutate.mockClear();
  mocks.moveCase.mutate.mockClear();
  mocks.pauseResume.mutate.mockClear();
});

describe('MatrixBoard', () => {
  it('EIN Pack je Zeile, innen aufgeteilt wie die Board-Karte (Laufend/Geplant)', () => {
    renderMatrix(null);
    expect(screen.getByText('Anna Berger')).toBeTruthy();
    // Das Pack zählt ALLE Belege — die Aufteilung passiert IM Container.
    expect(screen.getByText('Pack 1 · 2 Belege · 20 Teile')).toBeTruthy();
    expect(screen.getByText('Laufend (1)')).toBeTruthy();
    expect(screen.getByText('Geplant (1)')).toBeTruthy();
    expect(screen.getByText('WE-k1')).toBeTruthy();
    expect(screen.getByText(/Keine Belege — zum Zuweisen hierher ziehen/)).toBeTruthy();
  });

  it('packSections teilt wie die Board-Karte auf — Fertig nur bei Bedarf', () => {
    const titles = (cs: BoardCase[]): string[] => packSections(cs).map((s) => s.title);
    expect(titles([bc('a', 'assigned'), bc('b', 'in_progress'), bc('c', 'completed')])).toEqual([
      'Laufend (1)',
      'Geplant (1)',
      'Fertig (1)',
    ]);
    expect(titles([bc('a', 'assigned')])).toEqual(['Laufend (0)', 'Geplant (1)']);
  });

  it('Hover auf einen Beleg-Strich öffnet die Schnellinfo der Board-Karte', async () => {
    renderMatrix(null);
    fireEvent.mouseOver(screen.getByText('WE-k1'));
    expect(
      await screen.findByText('Klick auf die Karte öffnet die vollständigen Details.', undefined, {
        timeout: 2000,
      }),
    ).toBeTruthy();
    expect(await screen.findByText('Lieferschein')).toBeTruthy();
    expect(screen.getByText('LS-2026-000302')).toBeTruthy();
    expect(screen.getByText('NOS_Nachorder')).toBeTruthy();
  });

  it('der Schicht-Streifen bedeckt beim Aufziehen die Zelle und öffnet den Pausen-Dialog', () => {
    const { requestReason } = renderMatrix(null);
    const handle = screen.getByLabelText('Anna Berger: Streifen über die Zelle ziehen für Pause');
    // jsdom kennt keinen PointerEvent-Konstruktor — MouseEvent trägt button/clientX,
    // isPrimary kommt als Expando dazu (React liest beides vom nativen Event).
    const pointer = (type: string, init: MouseEventInit): MouseEvent => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
      Object.assign(e, { isPrimary: true, pointerId: 1 });
      return e;
    };
    fireEvent(handle, pointer('pointerdown', { button: 0, clientX: 5, clientY: 5 }));
    // Bis ans andere Ende der Zelle ziehen (jsdom-Fallback-Breite 150px) — erst
    // wenn das Farbband die Zelle bedeckt, feuert der Dialog.
    fireEvent(handle, pointer('pointermove', { clientX: 200, clientY: 6 }));
    expect(requestReason).toHaveBeenCalledTimes(1);
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('Anna Berger: Pause/Abwesenheit');
    action.run('Pause');
    expect(mocks.pauseResume.mutate).toHaveBeenCalledWith({
      bundleId: 'b-emp1',
      reason: 'Pause',
      paused: false,
    });
  });

  it('nennt die Zugehörigkeit eines Gruppen-Belegs im Wortlaut des Boards', () => {
    renderMatrix(null);
    expect(screen.getByText('🟡 Lieferung ×2 · 2 von 3 · 1 fehlt · LS-77')).toBeTruthy();
  });

  it('Ablage-Drop auf eine Zeile fragt den Grund ab und ruft assignToEmployee', () => {
    const { requestReason } = renderMatrix(ablageDrag);
    const target = screen.getByTestId('matrix-row-emp2');
    fireEvent.dragOver(target, { dataTransfer: dt() });
    fireEvent.drop(target, { dataTransfer: dt() });
    expect(requestReason).toHaveBeenCalledTimes(1);
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE 900 an Bernd Voss zuweisen');
    action.run('Kapazität frei');
    expect(mocks.assignToEmployee.mutate).toHaveBeenCalledWith({
      employeeNo: 'emp2',
      caseId: 'c9',
      reason: 'Kapazität frei',
    });
  });

  it('Matrix-Drop auf einen anderen Mitarbeiter ruft moveCase mit Quell-Bündel', () => {
    const { requestReason } = renderMatrix({
      source: 'matrix',
      caseId: 'k2',
      weBelegNo: 'WE-k2',
      status: 'assigned',
      bundleId: 'b-emp1',
      employeeId: 'emp1',
      employeeName: 'Anna Berger',
    });
    const target = screen.getByTestId('matrix-row-emp2');
    fireEvent.drop(target, { dataTransfer: dt() });
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    action.run('Auslastung ausgleichen');
    expect(mocks.moveCase.mutate).toHaveBeenCalledWith({
      bundleId: 'b-emp1',
      caseId: 'k2',
      targetEmployeeNo: 'emp2',
      reason: 'Auslastung ausgleichen',
    });
  });

  it('ungültige Drops (geparkter Beleg) lösen nichts aus', () => {
    const { requestReason } = renderMatrix({ ...ablageDrag, status: 'parked' });
    fireEvent.drop(screen.getByTestId('matrix-row-emp2'), { dataTransfer: dt() });
    expect(requestReason).not.toHaveBeenCalled();
  });

  it('der Drag-Griff eines geplanten Belegs startet den Matrix-Drag mit dem Item-Bündel', () => {
    const { onDragStart } = renderMatrix(null);
    fireEvent.dragStart(screen.getByLabelText('WE-k2 aus Bündel ziehen'), { dataTransfer: dt() });
    expect(onDragStart).toHaveBeenCalledWith({
      source: 'matrix',
      caseId: 'k2',
      weBelegNo: 'WE-k2',
      status: 'assigned',
      bundleId: 'b-emp1',
      employeeId: 'emp1',
      employeeName: 'Anna Berger',
    });
  });

  it('laufende und fertige Belege haben keinen Drag-Griff, sondern ein Schloss', () => {
    renderMatrix(null);
    expect(screen.queryByLabelText('WE-k1 aus Bündel ziehen')).toBeNull();
    expect(
      screen.getByLabelText('WE-k1 ist gesperrt (in Arbeit: in Arbeit) — nicht verschiebbar'),
    ).toBeTruthy();
  });

  it('Drop auf ein anderes Pack DESSELBEN Mitarbeiters hängt um (moveCase mit Pack-Ziel)', () => {
    const { requestReason } = renderMatrix(matrixDragK2, ZWEI_PACKS);
    fireEvent.drop(screen.getByTestId('matrix-pack-emp1-1'), { dataTransfer: dt() });
    expect(requestReason).toHaveBeenCalledTimes(1);
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE-k2 in Pack 2 umhängen');
    action.run('Reihenfolge anpassen');
    expect(mocks.moveCase.mutate).toHaveBeenCalledWith({
      bundleId: 'b-emp1',
      caseId: 'k2',
      targetEmployeeNo: 'emp1',
      targetPackIndex: 1,
      reason: 'Reihenfolge anpassen',
    });
  });

  it('Drop auf ein Pack eines ANDEREN Mitarbeiters verschiebt genau dorthin', () => {
    const { requestReason } = renderMatrix(matrixDragK2, ZWEI_PACKS);
    fireEvent.drop(screen.getByTestId('matrix-pack-emp2-0'), { dataTransfer: dt() });
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE-k2 zu Bernd Voss in Pack 1 verschieben');
    action.run('Auslastung ausgleichen');
    expect(mocks.moveCase.mutate).toHaveBeenCalledWith({
      bundleId: 'b-emp1',
      caseId: 'k2',
      targetEmployeeNo: 'emp2',
      targetPackIndex: 0,
      reason: 'Auslastung ausgleichen',
    });
  });

  it('das eigene Pack ist kein Ziel — der Drop läuft ins Leere', () => {
    const { requestReason } = renderMatrix(matrixDragK2, ZWEI_PACKS);
    fireEvent.drop(screen.getByTestId('matrix-pack-emp1-0'), { dataTransfer: dt() });
    expect(requestReason).not.toHaveBeenCalled();
  });

  it('ein laufender Beleg lässt sich in kein Pack ziehen (Frei/Fix)', () => {
    const { requestReason } = renderMatrix(
      { ...matrixDragK2, caseId: 'k1', weBelegNo: 'WE-k1', status: 'in_progress' },
      ZWEI_PACKS,
    );
    fireEvent.drop(screen.getByTestId('matrix-pack-emp1-1'), { dataTransfer: dt() });
    fireEvent.drop(screen.getByTestId('matrix-pack-emp2-0'), { dataTransfer: dt() });
    expect(requestReason).not.toHaveBeenCalled();
    expect(mocks.moveCase.mutate).not.toHaveBeenCalled();
  });
});
