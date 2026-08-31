/**
 * Kanban-Rasteransicht: Drop-Gesten münden im §8.4-ReasonDialog-Fluss —
 * fremder Mitarbeiter → moveCase, gleiche Person → reorder. Der Store ist
 * gemockt (Muster wie AssignDialog.test), gezogen wird über die nativen
 * HTML5-Drag-Events mit einem dataTransfer-Stub.
 *
 * Dazu die goldene Karte des geteilten Belegs (Konzept beleg-zusammenarbeit §4):
 * Beteiligten-Zeile, Tooltip mit dem Stand und „Aus geteiltem Beleg entfernen"
 * über denselben Pflichtgrund-Fluss.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, createQueryClient } from '@paket/ui';
import type { BoardCase, BoardParticipant, BoardRow } from '../../data/types.js';
import type { PendingAction } from './MitarbeiterBoard.js';
import { KanbanBoard } from './KanbanBoard.js';
import { GROUP_IDENTITY_COLORS, buildGroupColorMap } from '../../components/LieferungChip.js';

const mocks = vi.hoisted(() => {
  const mutation = () => ({ mutate: vi.fn(), isError: false, error: null, reset: vi.fn() });
  return {
    moveCase: mutation(),
    reorder: mutation(),
    assignBundle: mutation(),
    pauseResume: mutation(),
    withdraw: mutation(),
    removeParticipant: mutation(),
  };
});

vi.mock('../../data/store.js', () => ({
  useCockpitData: () => mocks,
}));

function bc(
  caseId: string,
  status: BoardCase['status'],
  sharedWith: BoardParticipant[] = [],
): BoardCase {
  return {
    caseId,
    weBelegNo: `WE-${caseId}`,
    status,
    totalQuantity: 10,
    estimatedMinutes: 12,
    effortPoints: 3,
    storageCode: 'R13',
    deliveryGroup: null,
    sharedWith,
  };
}

/** Geteilter Beleg: ein Helfer (→ „mit <Name>") bzw. zwei (→ „2×"). */
const CARLA: BoardParticipant = {
  employeeNo: 'ma-3',
  displayName: 'Carla Ruiz',
  status: 'angenommen',
};
const DENIZ: BoardParticipant = {
  employeeNo: 'ma-4',
  displayName: 'Deniz Yilmaz',
  status: 'teil_erledigt',
};

function row(partial: Partial<BoardRow> & Pick<BoardRow, 'employeeId' | 'displayName'>): BoardRow {
  return {
    skillTier: 'basis',
    plannedTeile: 0,
    plannedHours: 0,
    utilisationPct: 0,
    assignedMinutes: 0,
    netCapacityMinutes: 271,
    effortPoints: 0,
    openIssues: 0,
    paused: false,
    bereiche: ['Regal'],
    cases: [],
    ...partial,
  };
}

const BOARD: BoardRow[] = [
  row({
    employeeId: 'ma-1',
    displayName: 'Anna',
    bundleId: 'b-1',
    bundleStatus: 'active',
    plannedTeile: 30,
    cases: [
      bc('k1', 'in_progress'),
      bc('k2', 'assigned', [CARLA]),
      bc('k3', 'assigned', [CARLA, DENIZ]),
    ],
  }),
  row({ employeeId: 'ma-2', displayName: 'Ben' }),
];

/** Minimaler dataTransfer-Stub — jsdom liefert bei Drag-Events keinen echten. */
function dt(): Record<string, unknown> {
  return { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn(() => '') };
}

function renderBoard(): { requestReason: ReturnType<typeof vi.fn> } {
  const requestReason = vi.fn();
  render(
    <AppProviders queryClient={createQueryClient({ retry: 0 })}>
      <MemoryRouter>
        <KanbanBoard
          board={BOARD}
          sort="standard"
          tiers={[]}
          onSortChange={vi.fn()}
          onTiersChange={vi.fn()}
          requestReason={requestReason}
        />
      </MemoryRouter>
    </AppProviders>,
  );
  return { requestReason };
}

beforeEach(() => {
  mocks.moveCase.mutate.mockClear();
  mocks.reorder.mutate.mockClear();
  mocks.withdraw.mutate.mockClear();
  mocks.removeParticipant.mutate.mockClear();
});

describe('KanbanBoard', () => {
  it('zeigt je Mitarbeiter die Abschnitte Laufend/Geplant und Drag-Griffe', () => {
    renderBoard();
    expect(screen.getByText('Laufend (1)')).toBeTruthy();
    expect(screen.getByText('Geplant (2)')).toBeTruthy();
    expect(screen.getByText('Frei — keine Belege zugewiesen.')).toBeTruthy();
    expect(screen.getByLabelText('WE-k2 ziehen')).toBeTruthy();
    // Bündel-Position bleibt sichtbar (Abholreihenfolge des gesamten Bündels).
    expect(screen.getByText('2. WE-k2')).toBeTruthy();
  });

  it('Drop auf einen anderen Mitarbeiter startet den moveCase-Eingriff mit Grund', () => {
    const { requestReason } = renderBoard();
    fireEvent.dragStart(screen.getByLabelText('WE-k2 ziehen'), { dataTransfer: dt() });
    const target = screen.getByTestId('kanban-frei-ma-2');
    fireEvent.dragOver(target, { dataTransfer: dt() });
    fireEvent.drop(target, { dataTransfer: dt() });

    expect(requestReason).toHaveBeenCalledTimes(1);
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE-k2 zu Ben verschieben');
    action.run('Auslastung ausgleichen');
    expect(mocks.moveCase.mutate).toHaveBeenCalledWith({
      bundleId: 'b-1',
      caseId: 'k2',
      targetEmployeeNo: 'ma-2',
      reason: 'Auslastung ausgleichen',
    });
  });

  it('Drop auf „Laufend" derselben Person zieht den Beleg per reorder vor', () => {
    const { requestReason } = renderBoard();
    fireEvent.dragStart(screen.getByLabelText('WE-k3 ziehen'), { dataTransfer: dt() });
    const zone = screen.getByTestId('kanban-laufend-ma-1');
    fireEvent.dragOver(zone, { dataTransfer: dt() });
    fireEvent.drop(zone, { dataTransfer: dt() });

    expect(requestReason).toHaveBeenCalledTimes(1);
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toContain('als Nächstes vorziehen');
    action.run('Prio vorgezogen');
    expect(mocks.reorder.mutate).toHaveBeenCalledWith({
      bundleId: 'b-1',
      caseIds: ['k1', 'k3', 'k2'],
      reason: 'Prio vorgezogen',
    });
  });

  it('laufende Belege sind innerhalb derselben Person nicht umsortierbar (Drop ohne Wirkung)', () => {
    const { requestReason } = renderBoard();
    fireEvent.dragStart(screen.getByLabelText('WE-k1 ziehen'), { dataTransfer: dt() });
    const zone = screen.getByTestId('kanban-geplant-ma-1');
    fireEvent.dragOver(zone, { dataTransfer: dt() });
    fireEvent.drop(zone, { dataTransfer: dt() });
    expect(requestReason).not.toHaveBeenCalled();
  });

  it('Entziehen-Zone erscheint nur beim Ziehen; Drop startet den Entziehen-Eingriff', () => {
    const { requestReason } = renderBoard();
    expect(screen.queryByTestId('kanban-entziehen')).toBeNull();

    fireEvent.dragStart(screen.getByLabelText('WE-k2 ziehen'), { dataTransfer: dt() });
    const trash = screen.getByTestId('kanban-entziehen');
    fireEvent.dragOver(trash, { dataTransfer: dt() });
    fireEvent.drop(trash, { dataTransfer: dt() });

    expect(requestReason).toHaveBeenCalledTimes(1);
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('WE-k2 von Anna entziehen');
    action.run('Überlastet');
    expect(mocks.withdraw.mutate).toHaveBeenCalledWith({
      caseId: 'k2',
      bundleId: 'b-1',
      reason: 'Überlastet',
    });
  });
});

describe('KanbanBoard — geteilter Beleg', () => {
  it('nennt zwischen Belegnummer und Teile-Zeile, mit wem gearbeitet wird', () => {
    renderBoard();
    // Genau ein Helfer → Name im Klartext; mehrere → Anzahl.
    expect(screen.getByText('mit Carla Ruiz')).toBeTruthy();
    expect(screen.getByText('2×')).toBeTruthy();
    // Nicht geteilte Belege bekommen weder Hinweis noch Entfernen-Symbol.
    expect(screen.queryByLabelText('WE-k1: Aus geteiltem Beleg entfernen')).toBeNull();
    expect(screen.getByLabelText('WE-k2: Aus geteiltem Beleg entfernen')).toBeTruthy();
  });

  it('der Tooltip listet die Beteiligten mit ihrem Stand', async () => {
    renderBoard();
    fireEvent.mouseOver(screen.getByText('2×'));
    expect(await screen.findByText('Carla Ruiz — hilft')).toBeTruthy();
    expect(screen.getByText('Deniz Yilmaz — Teil erledigt')).toBeTruthy();
  });

  it('das Personen-Symbol führt über den Pflichtgrund zum Entfernen des Helfers', () => {
    const { requestReason } = renderBoard();
    fireEvent.click(screen.getByLabelText('WE-k2: Aus geteiltem Beleg entfernen'));
    fireEvent.click(screen.getByText('Aus geteiltem Beleg entfernen: Carla Ruiz'));

    expect(requestReason).toHaveBeenCalledTimes(1);
    const action = requestReason.mock.calls[0]![0] as PendingAction;
    expect(action.title).toBe('Aus geteiltem Beleg entfernen: Carla Ruiz');
    expect(action.suggestions).toContain('Schichtende');
    action.run('Schichtende');
    expect(mocks.removeParticipant.mutate).toHaveBeenCalledWith({
      caseId: 'k2',
      employeeNo: 'ma-3',
      reason: 'Schichtende',
    });
  });

  it('Rechtsklick auf die goldene Karte öffnet dasselbe Menü', () => {
    renderBoard();
    fireEvent.contextMenu(screen.getByText('3. WE-k3'));
    expect(screen.getByText('Aus geteiltem Beleg entfernen: Carla Ruiz')).toBeTruthy();
    expect(screen.getByText('Aus geteiltem Beleg entfernen: Deniz Yilmaz')).toBeTruthy();
  });
});

describe('buildGroupColorMap', () => {
  it('vergibt je Lieferung eine konsistente Kennfarbe in Erst-Auftretens-Reihenfolge', () => {
    const map = buildGroupColorMap(['g1', null, 'g2', 'g1', undefined, 'g3']);
    expect(map.get('g1')).toBe(GROUP_IDENTITY_COLORS[0]);
    expect(map.get('g2')).toBe(GROUP_IDENTITY_COLORS[1]);
    expect(map.get('g3')).toBe(GROUP_IDENTITY_COLORS[2]);
    expect(map.size).toBe(3);
  });
});
