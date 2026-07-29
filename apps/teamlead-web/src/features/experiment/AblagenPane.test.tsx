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
    openIssue: null,
    forwardedTo: null,
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
    unforwardCase: vi.fn(),
    withdraw: mutation(),
  };
});
vi.mock('../../data/store.js', () => ({ useCockpitData: () => mocks }));

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
} {
  const requestReason = vi.fn();
  const onForward = vi.fn();
  render(
    <AppProviders queryClient={createQueryClient({ retry: 0 })}>
      <MemoryRouter>
        <AblagenPane
          groupColorById={new Map()}
          dragging={dragging}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
          requestReason={requestReason}
          onForward={onForward}
        />
      </MemoryRouter>
    </AppProviders>,
  );
  return { requestReason, onForward };
}

beforeEach(() => {
  mocks.parkCase.mockClear();
  mocks.releaseCase.mockClear();
  mocks.withdraw.mutate.mockClear();
});

describe('AblagenPane', () => {
  it('zeigt die Lanes mit Karten und Zähler', () => {
    renderPane(null);
    expect(screen.getByText('Sonstige')).toBeTruthy();
    expect(screen.getByText('WE 100')).toBeTruthy();
    expect(screen.getByText('WE 200')).toBeTruthy();
  });

  it('ready → „Geparkt" fragt den Grund ab und parkt', () => {
    const { requestReason } = renderPane(ablageDrag());
    fireEvent.drop(screen.getByTestId('experiment-lane-geparkt'), { dataTransfer: dt() });
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE 100 parken');
    action.run('Wartet auf Klärung');
    expect(mocks.parkCase).toHaveBeenCalledWith('c1', 'Wartet auf Klärung');
  });

  it('geparkt → Pool-Lane entparkt über den Grund-Dialog', () => {
    const { requestReason } = renderPane(
      ablageDrag({ caseId: 'c2', weBelegNo: 'WE 200', status: 'parked', lane: 'geparkt' }),
    );
    fireEvent.drop(screen.getByTestId('experiment-lane-sonstige'), { dataTransfer: dt() });
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE 200 entparken');
    action.run('Klärung erfolgt');
    expect(mocks.releaseCase).toHaveBeenCalledWith('c2', 'Klärung erfolgt');
  });

  it('ungültiges Ziel (geparkt → Prio) löst nichts aus', () => {
    const { requestReason } = renderPane(
      ablageDrag({ caseId: 'c2', status: 'parked', lane: 'geparkt' }),
    );
    fireEvent.drop(screen.getByTestId('experiment-lane-prio'), { dataTransfer: dt() });
    expect(requestReason).not.toHaveBeenCalled();
  });

  it('die Entziehen-Zone erscheint nur bei Matrix-Drags und ruft withdraw', () => {
    const { requestReason } = renderPane({
      source: 'matrix',
      caseId: 'k2',
      weBelegNo: 'WE-k2',
      status: 'assigned',
      bundleId: 'b-1',
      employeeId: 'emp1',
      employeeName: 'Anna Berger',
    });
    const zone = screen.getByTestId('experiment-entziehen');
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

  it('ohne Drag gibt es keine Entziehen-Zone', () => {
    renderPane(null);
    expect(screen.queryByTestId('experiment-entziehen')).toBeNull();
  });
});
