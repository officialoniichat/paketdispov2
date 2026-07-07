import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders, createQueryClient } from '@paket/ui';
import { AssignBrowseDrawer } from './AssignBrowseDrawer.js';
import * as belege from '../data/belege.js';
import type { BoardRow } from '../data/types.js';
import type { CaseSearchResult } from '../data/belege.js';

vi.mock('../data/belege.js', async () => {
  const actual = await vi.importActual<typeof import('../data/belege.js')>('../data/belege.js');
  return { ...actual, searchAssignableCases: vi.fn() };
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

function result(partial: Partial<CaseSearchResult> & Pick<CaseSearchResult, 'caseId' | 'weBelegNo'>): CaseSearchResult {
  return {
    bereich: 'Regal',
    goodsType: null,
    teile: 20,
    estimatedMinutes: 30,
    storageLocationCode: 'R41',
    priorityFlags: [],
    deliveryGroup: null,
    ...partial,
  };
}

function renderDrawer(onBulkAdd = vi.fn()) {
  const client = createQueryClient({ retry: 0 });
  render(
    <AppProviders queryClient={client}>
      <AssignBrowseDrawer open row={ROW} excludeCaseIds={[]} onBulkAdd={onBulkAdd} />
    </AppProviders>,
  );
  return { onBulkAdd };
}

beforeEach(() => {
  vi.mocked(belege.searchAssignableCases).mockResolvedValue([
    result({ caseId: 'case-1', weBelegNo: 'WE-1001' }),
    result({ caseId: 'case-2', weBelegNo: 'WE-1002' }),
  ]);
});

describe('AssignBrowseDrawer', () => {
  it('lists assignable Belege and bulk-adds the checked ones', async () => {
    const user = userEvent.setup();
    const { onBulkAdd } = renderDrawer();

    await waitFor(() => expect(screen.getByText('WE-1001')).toBeTruthy());
    await user.click(screen.getByLabelText('WE-1001 auswählen'));
    await user.click(screen.getByLabelText('WE-1002 auswählen'));

    const submit = screen.getByRole('button', { name: /Auswahl übernehmen/ });
    await user.click(submit);

    expect(onBulkAdd).toHaveBeenCalledTimes(1);
    const added = onBulkAdd.mock.calls[0]![0] as CaseSearchResult[];
    expect(added.map((r) => r.caseId).sort()).toEqual(['case-1', 'case-2']);
  });

  it('shows the free-capacity hint for the target employee', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText(/Timo/)).toBeTruthy());
    expect(screen.getByText(/4 h 31 min frei/)).toBeTruthy();
  });
});
