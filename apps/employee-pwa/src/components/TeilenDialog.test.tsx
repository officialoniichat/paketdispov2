// @vitest-environment jsdom
/**
 * „Beleg teilen"-Dialog (Zusammenarbeit 31.08.2026): Auswahl → POST-Body,
 * Markierung bereits Beteiligter, Nachricht optional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { components } from '@paket/api-client';
import * as apiModule from '../data/api.js';
import { TeilenDialog, beteiligungsLabel } from './TeilenDialog.js';

type CaseSummaryDto = components['schemas']['CaseSummaryDto'];
type CaseParticipantDto = components['schemas']['CaseParticipantDto'];

const KOLLEGEN = [
  { employeeNo: '101', displayName: 'Anna Berger', shiftToday: true },
  { employeeNo: '102', displayName: 'Bernd Weiß', shiftToday: false },
];

/** Beleg mit Inhaber-Zeile (ich) und einer bereits eingeladenen Kollegin. */
const BELEG = {
  id: 'c1',
  weBelegNo: '4711',
  status: 'assigned',
  collaboration: {
    positionCount: 4,
    confirmedPositionCount: 1,
    participants: [
      {
        participantId: 'p-inh',
        employeeNo: '100',
        displayName: 'Ich Selbst',
        role: 'inhaber',
        status: 'angenommen',
        invitedAt: '2026-08-31T08:00:00.000Z',
        confirmedPositionCount: 1,
      },
      {
        participantId: 'p-ein',
        employeeNo: '102',
        displayName: 'Bernd Weiß',
        role: 'helfer',
        status: 'eingeladen',
        invitedAt: '2026-08-31T08:05:00.000Z',
        confirmedPositionCount: 0,
      },
    ],
  },
} as unknown as CaseSummaryDto;

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockApi() {
  const get = vi
    .fn()
    .mockResolvedValue({ data: KOLLEGEN, error: undefined, response: { status: 200 } });
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

describe('TeilenDialog', () => {
  it('Auswahl + Nachricht → POST /invitations mit employeeNos und message', async () => {
    const { post } = mockApi();
    render(<TeilenDialog open beleg={BELEG} onClose={vi.fn()} />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByText('Anna Berger'));
    fireEvent.change(screen.getByLabelText('Nachricht (optional)'), {
      target: { value: 'Magst du helfen?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Einladen (1)' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/me/cases/{caseId}/invitations', {
        params: { path: { caseId: 'c1' } },
        body: { employeeNos: ['101'], message: 'Magst du helfen?' },
      }),
    );
  });

  it('ohne Nachricht wird KEIN message-Feld mitgeschickt (ValidationPipe whitelist)', async () => {
    const { post } = mockApi();
    render(<TeilenDialog open beleg={BELEG} onClose={vi.fn()} />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByText('Anna Berger'));
    fireEvent.click(screen.getByRole('button', { name: 'Einladen (1)' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[1]).toEqual({
      params: { path: { caseId: 'c1' } },
      body: { employeeNos: ['101'] },
    });
  });

  it('bereits Eingeladene sind markiert (Haken) und nicht erneut anhakbar', async () => {
    mockApi();
    render(<TeilenDialog open beleg={BELEG} onClose={vi.fn()} />, { wrapper: Wrapper });

    await screen.findByText('Bernd Weiß');
    // Markiert: Haken gesetzt, Status statt „heute im Dienst" in der Zeile.
    const checkbox = screen.getByLabelText('Bernd Weiß auswählen');
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('eingeladen')).toBeTruthy();
    // Ohne echte Auswahl bleibt „Einladen" ohne Zähler und gesperrt.
    const einladen = screen.getByRole('button', { name: 'Einladen' });
    expect(einladen.hasAttribute('disabled')).toBe(true);
  });
});

describe('beteiligungsLabel', () => {
  const beteiligung = (role: string, status: string): CaseParticipantDto =>
    ({
      participantId: 'p',
      employeeNo: '1',
      displayName: 'X',
      role,
      status,
      invitedAt: '2026-08-31T08:00:00.000Z',
      confirmedPositionCount: 0,
    }) as CaseParticipantDto;

  it('sperrt eingeladen/angenommen/teil_erledigt mit A7-Vokabular', () => {
    expect(beteiligungsLabel(beteiligung('helfer', 'eingeladen'))).toBe('eingeladen');
    expect(beteiligungsLabel(beteiligung('helfer', 'angenommen'))).toBe('hilft');
    expect(beteiligungsLabel(beteiligung('helfer', 'teil_erledigt'))).toBe('Teil erledigt');
    expect(beteiligungsLabel(beteiligung('inhaber', 'angenommen'))).toBe('Inhaber');
  });

  it('abgelehnt/entfernt sind wieder einladbar (kein Label, keine Sperre)', () => {
    expect(beteiligungsLabel(beteiligung('helfer', 'abgelehnt'))).toBeUndefined();
    expect(beteiligungsLabel(beteiligung('helfer', 'entfernt'))).toBeUndefined();
  });
});
