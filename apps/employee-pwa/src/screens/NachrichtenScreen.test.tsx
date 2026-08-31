// @vitest-environment jsdom
/**
 * Nachrichten-Verlauf (Zusammenarbeit 31.08.2026): Einträge mit Titel, Text und
 * Status-Chip; offene Einladungen mit Haken/Kreuz-Tasten; Teamlead-Nachrichten
 * mit „Gelesen"-Quittung über den bestehenden Endpunkt.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import * as apiModule from '../data/api.js';
import { NachrichtenPanel } from './NachrichtenScreen.js';

const POSTEINGANG = {
  pendingCount: 2,
  items: [
    {
      id: 'p1',
      kind: 'einladung_erhalten',
      caseId: 'c1',
      weBelegNo: '4711',
      fromLabel: 'Hakan Yilmaz',
      toLabel: 'Ich',
      text: 'Hilfst du?',
      createdAt: '2026-08-31T09:00:00.000Z',
      status: 'offen',
      respondedAt: null,
      participantId: 'p1',
    },
    {
      id: 'p2',
      kind: 'einladung_gesendet',
      caseId: 'c2',
      weBelegNo: '4712',
      fromLabel: 'Ich',
      toLabel: 'Clara Dietrich',
      text: null,
      createdAt: '2026-08-31T08:30:00.000Z',
      status: 'angenommen',
      respondedAt: '2026-08-31T08:45:00.000Z',
      participantId: 'p2',
    },
    {
      id: 'm1',
      kind: 'teamlead',
      caseId: null,
      weBelegNo: null,
      fromLabel: 'Teamleitung',
      toLabel: 'Ich',
      text: 'Bitte zuerst die Palette am Tor.',
      createdAt: '2026-08-31T08:00:00.000Z',
      status: 'ungelesen',
      respondedAt: null,
      participantId: null,
    },
  ],
};

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function mockApi() {
  const get = vi
    .fn()
    .mockResolvedValue({ data: POSTEINGANG, error: undefined, response: { status: 200 } });
  const post = vi.fn().mockResolvedValue({ data: {}, error: undefined, response: { status: 200 } });
  vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
    GET: get,
    POST: post,
  } as unknown as ReturnType<typeof apiModule.getApiClient>);
  return { get, post };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('NachrichtenPanel', () => {
  it('rendert alle drei Eintragsarten mit Titel und Status-Chip', async () => {
    mockApi();
    render(<NachrichtenPanel variant="voll" />, { wrapper: Wrapper });

    expect(
      await screen.findByText('Hakan Yilmaz lädt dich ein, WE 4711 gemeinsam zu bearbeiten'),
    ).toBeTruthy();
    expect(screen.getByText('Einladung an Clara Dietrich · WE 4712')).toBeTruthy();
    expect(screen.getByText('Nachricht vom Teamlead')).toBeTruthy();
    expect(screen.getByText('offen')).toBeTruthy();
    expect(screen.getByText('angenommen')).toBeTruthy();
    expect(screen.getByText('ungelesen')).toBeTruthy();
    // Offene Einladung trägt die Antwort-Tasten direkt im Eintrag.
    expect(screen.getByLabelText('Einladung annehmen')).toBeTruthy();
    expect(screen.getByLabelText('Einladung ablehnen')).toBeTruthy();
    // Vollbild (Handy) hat die Zurück-Taste.
    expect(screen.getByLabelText('Zurück')).toBeTruthy();
  });

  it('„Gelesen" quittiert eine Teamlead-Nachricht über den bestehenden Endpunkt', async () => {
    const { post } = mockApi();
    render(<NachrichtenPanel variant="voll" />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByRole('button', { name: 'Gelesen' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/me/messages/{id}/read', {
        params: { path: { id: 'm1' } },
      }),
    );
  });

  it('meldet einen leeren Posteingang als „Keine Nachrichten."', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { pendingCount: 0, items: [] },
      error: undefined,
      response: { status: 200 },
    });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: get,
      POST: vi.fn(),
    } as unknown as ReturnType<typeof apiModule.getApiClient>);
    render(<NachrichtenPanel variant="voll" />, { wrapper: Wrapper });

    expect(await screen.findByText('Keine Nachrichten.')).toBeTruthy();
  });
});
