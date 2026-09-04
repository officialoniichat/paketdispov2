import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, createQueryClient } from '@paket/ui';
import { SchnellaktionenFlyout } from './SchnellaktionenFlyout.js';
import { abgehaktZuruecksetzen } from './schnellaktionen.js';
import {
  schreibeStarterStatus,
  starterStatusZuruecksetzen,
} from '../experiment/starterStatus.js';

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
// Kein HTTP im Unit-Test: der Nachrichten-Lesestatus kommt gemockt (leer).
vi.mock('../../data/nachrichten.js', () => ({
  useGesendeteNachrichten: () => [],
  sendeNachricht: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  abgehaktZuruecksetzen();
  starterStatusZuruecksetzen();
});

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
    expect(screen.getByText('2 · Probleme offen')).toBeTruthy();
    // Die AppShell hört mit und hebt die Rail über alle Ebenen.
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByLabelText('Schnellaktionen schließen'));
    expect(screen.queryByText('2 · Probleme offen')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('Abhaken entfernt die Meldung, schließt das leere Panel und fährt den Knopf ein', () => {
    const onOpenChange = vi.fn();
    render(
      <AppProviders queryClient={createQueryClient({ retry: 0 })}>
        <MemoryRouter>
          <SchnellaktionenFlyout onOpenChange={onOpenChange} />
        </MemoryRouter>
      </AppProviders>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Schnellaktionen ausklappen — 1 Meldung' }));
    fireEvent.click(screen.getByLabelText('Probleme offen abhaken'));
    // Meldung weg → Panel klappt automatisch zu, Knopf ist eingefahren (aria-hidden).
    expect(screen.queryByText('2 · Probleme offen')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('button', { name: /Schnellaktionen ausklappen/ })).toBeNull();
  });

  it('Aktions-Klick springt nur (Fokus) und hakt NICHT ab — Knopf bleibt ausgefahren', () => {
    const onOpenChange = vi.fn();
    render(
      <AppProviders queryClient={createQueryClient({ retry: 0 })}>
        <MemoryRouter>
          <SchnellaktionenFlyout onOpenChange={onOpenChange} />
        </MemoryRouter>
      </AppProviders>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Schnellaktionen ausklappen — 1 Meldung' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ansehen →' }));
    // Panel schließt (Sprung ins DA.M.B), aber die Meldung bleibt offen …
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    // … und der Knopf bleibt ausgefahren: weiterhin 1 un-abgehakte Meldung.
    expect(
      screen.getByRole('button', { name: 'Schnellaktionen ausklappen — 1 Meldung' }),
    ).toBeTruthy();
  });

  it('zeigt „Starterbündel generiert" aus der Vorverteilung im Popout an', () => {
    schreibeStarterStatus({ generiertAm: new Date().toISOString(), anzahl: 3, auto: true });
    render(
      <AppProviders queryClient={createQueryClient({ retry: 0 })}>
        <MemoryRouter>
          <SchnellaktionenFlyout onOpenChange={vi.fn()} />
        </MemoryRouter>
      </AppProviders>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Schnellaktionen ausklappen — 1 Meldung' }));
    expect(screen.getByText('Starterbündel generiert')).toBeTruthy();
    expect(screen.getByText(/3 Bündel/)).toBeTruthy();
    expect(screen.getByText(/automatisch erstellt/)).toBeTruthy();
  });
});
