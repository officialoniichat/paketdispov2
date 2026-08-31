// @vitest-environment jsdom
/**
 * Bildschirm-Benachrichtigung der Einladung (Zusammenarbeit 31.08.2026):
 * zeigt die ÄLTESTE offene Einladung, grüner Haken → respond accept:true,
 * rotes Kreuz → accept:false; ohne offene Einladung erscheint nichts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as apiModule from '../data/api.js';
import { EinladungOverlay } from './EinladungOverlay.js';

const POSTEINGANG = {
  pendingCount: 2,
  items: [
    // Neueste zuerst (Backend-Sortierung) — die ÄLTESTE steht unten.
    {
      id: 'p2',
      kind: 'einladung_erhalten',
      caseId: 'c2',
      weBelegNo: '4720',
      fromLabel: 'Clara Dietrich',
      toLabel: 'Ich',
      text: null,
      createdAt: '2026-08-31T10:00:00.000Z',
      status: 'offen',
      respondedAt: null,
      participantId: 'p2',
    },
    {
      id: 'p1',
      kind: 'einladung_erhalten',
      caseId: 'c1',
      weBelegNo: '4711',
      fromLabel: 'Hakan Yilmaz',
      toLabel: 'Ich',
      text: 'Ich mache Position 1–4, magst du den Rest?',
      createdAt: '2026-08-31T09:00:00.000Z',
      status: 'offen',
      respondedAt: null,
      participantId: 'p1',
    },
  ],
};

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockApi(posteingang: unknown = POSTEINGANG) {
  const get = vi
    .fn()
    .mockResolvedValue({ data: posteingang, error: undefined, response: { status: 200 } });
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

describe('EinladungOverlay', () => {
  it('zeigt die ÄLTESTE offene Einladung mit Text und Nachricht', async () => {
    mockApi();
    render(<EinladungOverlay />, { wrapper: Wrapper });

    expect(
      await screen.findByText('Hakan Yilmaz lädt dich ein, WE 4711 gemeinsam zu bearbeiten'),
    ).toBeTruthy();
    expect(screen.getByText('„Ich mache Position 1–4, magst du den Rest?“')).toBeTruthy();
    // Die neuere Einladung wartet, bis die ältere beantwortet ist.
    expect(screen.queryByText(/Clara Dietrich lädt dich ein/)).toBeNull();
  });

  it('grüner Haken → respond accept:true für die Beteiligungs-Zeile', async () => {
    const { post } = mockApi();
    render(<EinladungOverlay />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByLabelText('Einladung annehmen'));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/me/invitations/{participantId}/respond', {
        params: { path: { participantId: 'p1' } },
        body: { accept: true },
      }),
    );
  });

  it('rotes Kreuz → respond accept:false', async () => {
    const { post } = mockApi();
    render(<EinladungOverlay />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByLabelText('Einladung ablehnen'));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/me/invitations/{participantId}/respond', {
        params: { path: { participantId: 'p1' } },
        body: { accept: false },
      }),
    );
  });

  it('ohne offene Einladung erscheint keine Benachrichtigung', async () => {
    mockApi({
      pendingCount: 0,
      items: [{ ...POSTEINGANG.items[1], status: 'angenommen' }],
    });
    const { container } = render(<EinladungOverlay />, { wrapper: Wrapper });

    await waitFor(() => expect(apiModule.getApiClient).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
