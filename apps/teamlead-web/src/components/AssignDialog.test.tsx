import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders, createQueryClient } from '@paket/ui';
import { AssignDialog } from './AssignDialog.js';
import * as belege from '../data/belege.js';
import type { BoardRow } from '../data/types.js';
import type { BelegLookup, CaseSearchResult } from '../data/belege.js';

vi.mock('../data/belege.js', async () => {
  const actual = await vi.importActual<typeof import('../data/belege.js')>('../data/belege.js');
  return {
    ...actual,
    lookupBeleg: vi.fn(),
    searchAssignableCases: vi.fn(),
  };
});

const ROW: BoardRow = {
  employeeId: 'ma-701',
  displayName: 'Timo',
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
};

function notFound(): BelegLookup {
  return {
    found: false,
    caseId: null,
    weBelegNo: null,
    status: null,
    bereich: null,
    teile: null,
    estimatedMinutes: null,
    assignedEmployeeName: null,
    assignable: false,
    reasonCode: 'not_found',
    deliveryGroup: null,
  };
}

function searchResult(partial: Partial<CaseSearchResult> & Pick<CaseSearchResult, 'caseId' | 'weBelegNo'>): CaseSearchResult {
  return {
    bereich: 'Regal',
    goodsType: null,
    teile: 15,
    estimatedMinutes: 20,
    storageLocationCode: 'R41',
    priorityFlags: [],
    deliveryGroup: null,
    ...partial,
  };
}

function renderDialog(onConfirm = vi.fn()) {
  const onClose = vi.fn();
  const client = createQueryClient({ retry: 0 });
  render(
    <AppProviders queryClient={client}>
      <AssignDialog open row={ROW} onConfirm={onConfirm} onClose={onClose} />
    </AppProviders>,
  );
  return { onConfirm, onClose };
}

describe('AssignDialog', () => {
  beforeEach(() => {
    vi.mocked(belege.lookupBeleg).mockResolvedValue(notFound());
    vi.mocked(belege.searchAssignableCases).mockResolvedValue([]);
  });

  it('still renders the exact-match not_found message when nothing matches', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText('WE-Belegnummer'), 'WE-DOES-NOT-EXIST');
    await waitFor(() =>
      expect(screen.getByText('Kein Beleg mit dieser WE-Belegnummer gefunden.')).toBeTruthy(),
    );
  });

  it('shows ranked live-search results below the field and adds one on click', async () => {
    vi.mocked(belege.searchAssignableCases).mockResolvedValue([
      searchResult({ caseId: 'case-9', weBelegNo: 'WE-9001' }),
    ]);
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('WE-Belegnummer'), 'WE-90');
    await waitFor(() => expect(screen.getByText('WE-9001')).toBeTruthy());

    await user.click(screen.getByText('WE-9001'));
    expect(screen.getByText(/WE-9001/)).toBeTruthy();
    expect(screen.getByText('Bündel anlegen & zuweisen (1)')).toBeTruthy();
  });

  it('opens the browse drawer and bulk-adds multiple Belege to the same tray', async () => {
    vi.mocked(belege.searchAssignableCases).mockImplementation(async (params) => {
      // The dropdown query passes `q`; the drawer's browse query does not.
      if (params.q) return [];
      return [
        searchResult({ caseId: 'case-1', weBelegNo: 'WE-1001' }),
        searchResult({ caseId: 'case-2', weBelegNo: 'WE-1002' }),
      ];
    });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText(/Durchsuchen/));
    await waitFor(() => expect(screen.getByText('WE-1001')).toBeTruthy());
    await user.click(screen.getByLabelText('WE-1001 auswählen'));
    await user.click(screen.getByLabelText('WE-1002 auswählen'));
    await user.click(screen.getByRole('button', { name: /Auswahl übernehmen/ }));

    expect(screen.getByText('Bündel anlegen & zuweisen (2)')).toBeTruthy();
  });
});
