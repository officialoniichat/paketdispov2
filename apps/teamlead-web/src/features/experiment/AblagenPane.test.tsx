import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, createQueryClient } from '@paket/ui';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { AblagenPane } from './AblagenPane.js';
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
  const card = (caseId: string, weBelegNo: string, status: string): Record<string, unknown> => ({
    caseId,
    weBelegNo,
    status,
    section: 5,
    priorityFlags: [],
    totalQuantity: 12,
    effortPoints: 5,
    estimatedMinutes: 6,
    storageCode: 'R13-04',
    issues: [],
    issueStatus: null,
    forwardedTo: null,
    assignedTo: null,
    bereich: 'Regal',
    attentionFlag: false,
    attentionNote: null,
    deliveryGroup: null,
  });
  const lane = (id: string, title: string, cards: unknown[]): Record<string, unknown> => ({
    id,
    title,
    description: '',
    cards,
    totalEffortMinutes: 0,
  });
  return {
    lanes: [
      lane('sonstige', 'Sonstige', [card('c1', 'WE 100', 'ready')]),
      lane('geparkt', 'Geparkt', [card('c2', 'WE 200', 'parked')]),
      lane('prio', 'Prio', []),
    ],
    parkCase: vi.fn(),
    releaseCase: vi.fn(),
    prioritiseCase: vi.fn(),
    deprioritiseCase: vi.fn(),
    approveCase: vi.fn(),
    cancelCase: vi.fn(),
    resolveProblems: vi.fn(),
    forwardCase: vi.fn(),
    unforwardCase: vi.fn(),
    flagAttention: vi.fn(),
    unflagAttention: vi.fn(),
    withdraw: mutation(),
  };
});
vi.mock('../../data/store.js', () => ({ useCockpitData: () => mocks }));
// AblagenBoard-Randbezüge, die im Test nicht real laufen sollen: Audit-Feed,
// Mitarbeiterliste (Split-Dialog) und der Zuweisen-Dialog.
vi.mock('../../data/api.js', () => ({ api: { GET: vi.fn(async () => ({ data: [] })) } }));
vi.mock('../../data/employees.js', () => ({ fetchEmployees: vi.fn(async () => ({ employees: [] })) }));
vi.mock('../split/useSplitCase.js', () => ({
  useSplitCase: () => ({ submit: vi.fn(), pending: false, error: null, clearError: vi.fn() }),
}));
vi.mock('../belege/AssignFromListDialog.js', () => ({ AssignFromListDialog: () => null }));

function dt(): {
  effectAllowed: string;
  dropEffect: string;
  setData: ReturnType<typeof vi.fn>;
  getData: ReturnType<typeof vi.fn>;
} {
  return { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn(() => '') };
}

function ablageDrag(
  overrides: Partial<Extract<ExperimentDragPayload, { source: 'ablage' }>> = {},
): ExperimentDragPayload {
  return {
    source: 'ablage',
    caseId: 'c1',
    weBelegNo: 'WE 100',
    status: 'ready',
    lane: 'sonstige',
    priorityFlags: [],
    forwardedTo: null,
    ...overrides,
  };
}

function renderPane(dragging: ExperimentDragPayload | null): {
  requestReason: ReturnType<typeof vi.fn>;
  onForward: ReturnType<typeof vi.fn>;
  onDragStart: ReturnType<typeof vi.fn>;
} {
  const requestReason = vi.fn();
  const onForward = vi.fn();
  const onDragStart = vi.fn();
  render(
    <AppProviders queryClient={createQueryClient({ retry: 0 })}>
      <MemoryRouter>
        <AblagenPane
          dragging={dragging}
          onDragStart={onDragStart}
          onDragEnd={vi.fn()}
          requestReason={requestReason}
          onForward={onForward}
        />
      </MemoryRouter>
    </AppProviders>,
  );
  return { requestReason, onForward, onDragStart };
}

beforeEach(() => {
  mocks.parkCase.mockClear();
  mocks.releaseCase.mockClear();
  mocks.withdraw.mutate.mockClear();
});

describe('AblagenPane', () => {
  it('bettet das Original-Board ein: Lanes + Karten, aber KEIN Bündel-Fenster', () => {
    renderPane(null);
    expect(screen.getByText('Sonstige')).toBeTruthy();
    expect(screen.getByText('WE 100')).toBeTruthy();
    expect(screen.getByText('WE 200')).toBeTruthy();
    // Original-Design-Merkmal: das Aktions-Menü jeder Karte ist da.
    expect(screen.getAllByText('Details').length).toBeGreaterThan(0);
    // Das frühere „Bündel erstellen"-Fenster ist komplett entfernt (Nutzer-Vorgabe).
    expect(screen.queryByTestId('ablagen-buendel-fenster')).toBeNull();
  });

  it('die ganze Karte ist der Drag-Griff und startet den Ablage-Drag', () => {
    const { onDragStart } = renderPane(null);
    fireEvent.dragStart(screen.getByLabelText('WE 100 aus Ablage ziehen'), { dataTransfer: dt() });
    expect(onDragStart).toHaveBeenCalledWith({
      source: 'ablage',
      caseId: 'c1',
      weBelegNo: 'WE 100',
      status: 'ready',
      lane: 'sonstige',
      priorityFlags: [],
      forwardedTo: null,
    });
  });

  it('ready → „Geparkt" fragt den Grund ab und parkt', () => {
    const { requestReason } = renderPane(ablageDrag());
    fireEvent.drop(screen.getByTestId('ablagen-lane-geparkt'), { dataTransfer: dt() });
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE 100 parken');
    action.run('Wartet auf Klärung');
    expect(mocks.parkCase).toHaveBeenCalledWith('c1', 'Wartet auf Klärung');
  });

  it('geparkt → Pool-Lane entparkt über den Grund-Dialog', () => {
    const { requestReason } = renderPane(
      ablageDrag({ caseId: 'c2', weBelegNo: 'WE 200', status: 'parked', lane: 'geparkt' }),
    );
    fireEvent.drop(screen.getByTestId('ablagen-lane-sonstige'), { dataTransfer: dt() });
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE 200 entparken');
    action.run('Klärung erfolgt');
    expect(mocks.releaseCase).toHaveBeenCalledWith('c2', 'Klärung erfolgt');
  });

  it('ungültiges Ziel (geparkt → Prio) löst nichts aus', () => {
    const { requestReason } = renderPane(
      ablageDrag({ caseId: 'c2', status: 'parked', lane: 'geparkt' }),
    );
    fireEvent.drop(screen.getByTestId('ablagen-lane-prio'), { dataTransfer: dt() });
    expect(requestReason).not.toHaveBeenCalled();
  });

  it('die Pool-Rückgabe (blauer Schleier) erscheint nur bei Matrix-Drags und ruft withdraw', () => {
    const { requestReason } = renderPane({
      source: 'matrix',
      caseId: 'k2',
      weBelegNo: 'WE-k2',
      status: 'assigned',
      bundleId: 'b-1',
      employeeId: 'emp1',
      employeeName: 'Anna Berger',
    });
    const zone = screen.getByTestId('pool-rueckgabe');
    // Drop irgendwo auf der Fläche = Entziehen, zurück in den Pool.
    fireEvent.drop(zone, { dataTransfer: dt() });
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE-k2 von Anna Berger entziehen');
    action.run('Überlastet');
    expect(mocks.withdraw.mutate).toHaveBeenCalledWith({
      caseId: 'k2',
      bundleId: 'b-1',
      reason: 'Überlastet',
    });
  });

  it('ohne Drag gibt es keine Pool-Rückgabe-Fläche', () => {
    renderPane(null);
    expect(screen.queryByTestId('pool-rueckgabe')).toBeNull();
  });
});
