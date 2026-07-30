import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AppProviders, createQueryClient } from '@paket/ui';
import { VorverteilungPane } from './VorverteilungPane.js';

// Engine-Dry-Run-Fixture: ma-2 ist sofort frei (0 Rest-Min) → Slot 1,
// ma-1 arbeitet noch 25 Min → Slot 2. Packung kommt NUR aus preview.bundles.
const mocks = vi.hoisted(() => ({
  board: [
    {
      employeeId: 'ma-1',
      displayName: 'Lena Fuchs',
      paused: false,
      absence: null,
      cases: [
        {
          caseId: 'b1',
          weBelegNo: 'WE-B1',
          status: 'in_progress',
          totalQuantity: 10,
          estimatedMinutes: 25,
          effortPoints: 2,
          storageCode: 'H1',
        },
      ],
    },
    { employeeId: 'ma-2', displayName: 'Omar Nasser', paused: false, absence: null, cases: [] },
  ],
  lanes: [
    {
      id: 'sonstige',
      title: 'Sonstige',
      description: '',
      totalEffortMinutes: 42,
      cards: [
        {
          caseId: 'c1',
          weBelegNo: 'WE-0001',
          status: 'ready',
          section: 'sonstige',
          priorityFlags: [],
          totalQuantity: 20,
          effortPoints: 4,
          estimatedMinutes: 18,
          storageCode: 'A1',
          openIssue: null,
        },
        {
          caseId: 'c2',
          weBelegNo: 'WE-0002',
          status: 'ready',
          section: 'sonstige',
          priorityFlags: [],
          totalQuantity: 15,
          effortPoints: 3,
          estimatedMinutes: 12,
          storageCode: 'A2',
          openIssue: null,
        },
        {
          caseId: 'c3',
          weBelegNo: 'WE-0003',
          status: 'ready',
          section: 'sonstige',
          priorityFlags: [],
          totalQuantity: 8,
          effortPoints: 2,
          estimatedMinutes: 9,
          storageCode: 'A3',
          openIssue: null,
        },
      ],
    },
  ],
  preview: {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    data: {
      date: '2026-07-30',
      bundleCount: 2,
      assignedCaseCount: 3,
      unassignedCaseCount: 1,
      durationMs: 12,
      loads: [],
      bundles: [
        {
          bundleId: 'p1',
          employeeId: 'ma-2',
          caseIds: ['c1', 'c2'],
          cases: [
            { caseId: 'c1', weBelegNo: 'WE-0001', teile: 20, minutes: 18 },
            { caseId: 'c2', weBelegNo: 'WE-0002', teile: 15, minutes: 12 },
          ],
          plannedEffortMinutes: 30,
          effortPoints: 7,
        },
        {
          bundleId: 'p2',
          employeeId: 'ma-1',
          caseIds: ['c3'],
          cases: [{ caseId: 'c3', weBelegNo: 'WE-0003', teile: 8, minutes: 9 }],
          plannedEffortMinutes: 9,
          effortPoints: 2,
        },
      ],
    },
  },
}));
vi.mock('../../data/store.js', () => ({ useCockpitData: () => mocks }));
// Keine echten HTTP-Calls im Unit-Test: die Id→employeeNo-Brücke bleibt leer,
// der Fallback (rohe Id) greift — die Fixtures nutzen dieselben Ids wie das Board.
vi.mock('../../data/employees.js', () => ({
  fetchEmployees: () => Promise.resolve({ employees: [] }),
}));

function renderPane(): void {
  render(
    <AppProviders queryClient={createQueryClient({ retry: 0 })}>
      <VorverteilungPane active dragging={null} onDragStart={() => {}} onDragEnd={() => {}} />
    </AppProviders>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('VorverteilungPane', () => {
  it('zeigt Engine-Bündel als Grid mit Reihenfolge und MA-Vorschlag (schnellster zuerst)', () => {
    renderPane();
    // Slot 1 = Omar (sofort frei) mit dem Engine-Bündel c1+c2, Slot 2 = Lena.
    const slot0 = within(screen.getByTestId('vorschlag-slot-0'));
    expect(slot0.getByText('1. Bündel')).toBeTruthy();
    expect(slot0.getByText('1. WE-0001')).toBeTruthy();
    expect(slot0.getByText('2. WE-0002')).toBeTruthy();
    expect(screen.getByTestId('vorschlag-ma-0').textContent).toBe('Omar Nasser');
    const slot1 = within(screen.getByTestId('vorschlag-slot-1'));
    expect(slot1.getByText('1. WE-0003')).toBeTruthy();
    // MA-Container darunter: Rangfolge + Frei-Prognose + Bündel-Fortschritt
    // (Omar ohne Bündel = 100 %, Lena mitten im 25-Min-Bündel = 0 %).
    expect(screen.getByText('jetzt frei')).toBeTruthy();
    expect(screen.getByText('frei in ≈ 25 Min')).toBeTruthy();
    expect(screen.getByTestId('ma-fortschritt-0').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByTestId('ma-fortschritt-1').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('3 Belege verplant · 1 im Topf')).toBeTruthy();
  });

  it('Pfeile ordnen um, ✕ nimmt den Beleg aus dem Vorschlag', () => {
    renderPane();
    fireEvent.click(screen.getByLabelText('WE-0002 nach oben'));
    const slot0 = within(screen.getByTestId('vorschlag-slot-0'));
    expect(slot0.getByText('1. WE-0002')).toBeTruthy();
    expect(slot0.getByText('2. WE-0001')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('WE-0002 aus dem Bündel nehmen'));
    expect(slot0.queryByText(/WE-0002/)).toBeNull();
  });

  it('MA-Vorschlag ist per Klick wechselbar; Zahnrad-Anzahl steuert die Slots', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('vorschlag-ma-0'));
    const items = screen.getAllByRole('menuitem');
    fireEvent.click(items.find((el) => el.textContent?.includes('Lena Fuchs')) as HTMLElement);
    expect(screen.getByTestId('vorschlag-ma-0').textContent).toBe('Lena Fuchs');

    fireEvent.click(screen.getByLabelText('Vorverteilung einstellen'));
    fireEvent.change(screen.getByLabelText('Bündel vorbereiten (nächste freie Mitarbeiter)'), {
      target: { value: '1' },
    });
    expect(screen.queryByTestId('vorschlag-slot-1')).toBeNull();
    expect(screen.getByText('Als Nächstes — 1 Bündel vorbereitet')).toBeTruthy();
  });
});
