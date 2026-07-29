import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, createQueryClient } from '@paket/ui';
import { SchnellaktionenFlyout } from './SchnellaktionenFlyout.js';

// Minimaler Cockpit-Ausschnitt: 2 offene Probleme → genau EINE Meldung.
const mocks = vi.hoisted(() => ({
  cockpit: {
    capacity: { freeCapacityMinutes: 120 },
    pool: { openIssues: 2, openCases: 0, endOfShiftOpen: 0 },
  },
  lanes: [],
  board: [],
}));
vi.mock('../../data/store.js', () => ({ useCockpitData: () => mocks }));

describe('SchnellaktionenFlyout', () => {
  it('Knopf meldet die Anzahl, klappt aus und meldet den Zustand nach oben (Overlay über allem)', () => {
    const onOpenChange = vi.fn();
    render(
      <AppProviders queryClient={createQueryClient({ retry: 0 })}>
        <MemoryRouter>
          <SchnellaktionenFlyout onOpenChange={onOpenChange} />
        </MemoryRouter>
      </AppProviders>,
    );
    const button = screen.getByRole('button', {
      name: 'Schnellaktionen ausklappen — 1 Meldung',
    });
    fireEvent.click(button);
    expect(screen.getByText('Schnellaktionen (1)')).toBeTruthy();
    expect(screen.getByText('Probleme offen')).toBeTruthy();
    // Die AppShell hört mit und hebt die Rail über alle Ebenen.
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByLabelText('Schnellaktionen schließen'));
    expect(screen.queryByText('Probleme offen')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
