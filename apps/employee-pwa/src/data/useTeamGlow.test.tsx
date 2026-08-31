// @vitest-environment jsdom
/**
 * Aufleuchten in der „Team-Ansicht" (Zusammenarbeit 31.08.2026): `markGlow`
 * merkt die Aktion eines Beteiligten, `useTeamGlow` liefert sie ~1,5 s lang und
 * schaltet danach von selbst wieder ab — ohne dass ein weiteres Ereignis kommt.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GLOW_DURATION_MS, markGlow, useTeamGlow } from './useTeamGlow.js';

function makeWrapper(client: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// Nur Timer und Uhr stellen: `queueMicrotask` muss echt bleiben, sonst käme die
// Benachrichtigung des Query-Caches im Test nie an.
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => vi.useRealTimers());

describe('useTeamGlow', () => {
  it('leuchtet nach einer Aktion und geht nach ~1,5 s wieder aus', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    markGlow(client, 'case-1', 'ma-2');

    const { result } = renderHook(() => useTeamGlow('case-1'), { wrapper: makeWrapper(client) });
    expect(result.current.has('ma-2')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(GLOW_DURATION_MS + 10);
    });
    expect(result.current.has('ma-2')).toBe(false);
  });

  it('hält die Beteiligten auseinander (jede Aktion für sich)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    markGlow(client, 'case-1', 'ma-2');

    const { result } = renderHook(() => useTeamGlow('case-1'), { wrapper: makeWrapper(client) });
    // React Query benachrichtigt seine Beobachter über setTimeout(0) — nach dem
    // Schreiben also einen Tick weiterdrehen, damit die Anzeige nachzieht.
    await act(async () => {
      vi.advanceTimersByTime(1000);
      markGlow(client, 'case-1', 'ma-3');
      vi.advanceTimersByTime(1);
    });

    expect([...result.current].sort()).toEqual(['ma-2', 'ma-3']);

    // Nach weiteren 600 ms ist nur noch die JÜNGERE Aktion sichtbar.
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect([...result.current]).toEqual(['ma-3']);
  });

  it('kennt kein Leuchten für einen Beleg ohne Ereignisse', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTeamGlow('case-2'), { wrapper: makeWrapper(client) });
    expect(result.current.size).toBe(0);
  });
});
