import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, createQueryClient } from '@paket/ui';
import type { BoardCase, BoardRow } from '../../data/types.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { MatrixBoard } from './MatrixBoard.js';
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
  return { assignToEmployee: mutation(), moveCase: mutation() };
});
vi.mock('../../data/store.js', () => ({ useCockpitData: () => mocks }));

function bc(caseId: string, status: BoardCase['status']): BoardCase {
  return {
    caseId,
    weBelegNo: `WE-${caseId}`,
    status,
    totalQuantity: 10,
    estimatedMinutes: 6,
    effortPoints: 5,
    storageCode: '',
    deliveryGroup: null,
  };
}

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
    packs,
  };
}

const BOARD: BoardRow[] = [
  row('emp1', 'Anna Berger', [bc('k1', 'in_progress'), bc('k2', 'assigned')], [['k1', 'k2']]),
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

function renderMatrix(dragging: ExperimentDragPayload | null): {
  requestReason: ReturnType<typeof vi.fn>;
  onDragStart: ReturnType<typeof vi.fn>;
} {
  const requestReason = vi.fn();
  const onDragStart = vi.fn();
  render(
    <AppProviders queryClient={createQueryClient({ retry: 0 })}>
      <MemoryRouter>
        <MatrixBoard
          board={BOARD}
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
});

describe('MatrixBoard', () => {
  it('zeigt je Mitarbeiter eine Zeile mit Pack-Rechteck und Belegstrichen', () => {
    renderMatrix(null);
    expect(screen.getByText('Anna Berger')).toBeTruthy();
    expect(screen.getByText('Pack 1 · 2 Belege · 20 Teile')).toBeTruthy();
    expect(screen.getByText('WE-k1')).toBeTruthy();
    expect(screen.getByText(/Keine Belege — zum Zuweisen hierher ziehen/)).toBeTruthy();
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

  it('laufende und fertige Belege haben keinen Drag-Griff', () => {
    renderMatrix(null);
    expect(screen.queryByLabelText('WE-k1 aus Bündel ziehen')).toBeNull();
  });
});
