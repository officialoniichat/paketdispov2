// @vitest-environment jsdom
/**
 * Profilkreis (Zusammenarbeit 31.08.2026): Badge = pendingCount des
 * Posteingangs (offene Einladungen + ungelesene Teamlead-Nachrichten);
 * Menüpunkt „Nachrichten" zwischen „Zur Teamlead-App" und „Abmelden".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import * as apiModule from '../data/api.js';
import { clearSession, setSession } from '../data/session.js';
import { ProfileMenu, initials } from './ProfileMenu.js';

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function mockPosteingang(pendingCount: number) {
  const get = vi.fn().mockResolvedValue({
    data: { pendingCount, items: [] },
    error: undefined,
    response: { status: 200 },
  });
  vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
    GET: get,
    POST: vi.fn(),
  } as unknown as ReturnType<typeof apiModule.getApiClient>);
}

function seedSession(): void {
  setSession({
    token: 'test-token',
    employeeNo: '100',
    displayName: 'Anna Berger',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.restoreAllMocks();
});

describe('ProfileMenu', () => {
  it('zeigt pendingCount als Zahl am Profilkreis', async () => {
    seedSession();
    mockPosteingang(3);
    render(<ProfileMenu />, { wrapper: Wrapper });

    expect(await screen.findByText('3')).toBeTruthy();
  });

  it('führt „Nachrichten" zwischen „Zur Teamlead-App" und „Abmelden"', async () => {
    seedSession();
    mockPosteingang(0);
    render(<ProfileMenu />, { wrapper: Wrapper });

    fireEvent.click(screen.getByLabelText('Profil Anna Berger'));

    const eintraege = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
    expect(eintraege).toEqual(['Zur Teamlead-App', 'Nachrichten', 'Abmelden']);
  });
});

describe('initials', () => {
  it('bildet Initialen aus erstem und letztem Namensteil', () => {
    expect(initials('Anna Berger')).toBe('AB');
    expect(initials('Hakan')).toBe('H');
  });
});
