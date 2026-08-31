// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { liveEventTypeSchema } from '@paket/domain-types';
import { useLiveUpdates } from './useLiveUpdates.js';
import { clearSession, setSession } from './session.js';
import { glowQueryKey, type GlowMap } from './useTeamGlow.js';

/**
 * Nachbau des Browser-EventSource: benannte SSE-Events (`event: <type>`) erreichen
 * NUR `addEventListener(type, …)`, nie `onmessage` — genau der Bug, den der Hook
 * behebt. `onmessage` bleibt absichtlich als Falle erhalten.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  close(): void {
    this.closed = true;
  }

  listenedTypes(): string[] {
    return [...this.listeners.keys()];
  }

  /** Sendet ein benanntes Event (wie der Server: `event: <type>`). */
  emit(type: string, data: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ type, data: JSON.stringify(data) } as MessageEvent);
    }
  }

  /** Unbenanntes Event — erreicht nur `onmessage`. */
  emitUnnamed(): void {
    this.onmessage?.({} as MessageEvent);
  }
}

function makeWrapper(client: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Ein vollständiges Live-Ereignis, wie der Server es sendet (`liveEventSchema`). */
function liveEvent(type: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type,
    recipients: ['ma-1'],
    caseId: 'case-1',
    status: null,
    actorEmployeeNo: 'ma-1',
    positionId: null,
    at: '2026-08-31T09:00:00.000Z',
    ...overrides,
  };
}

function login(): void {
  setSession({
    token: 'my-token',
    employeeNo: 'ma-1',
    displayName: 'Test',
    exp: Date.now() / 1000 + 3600,
  });
}

describe('useLiveUpdates', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it('(a) does nothing when there is no session', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('(b) opens a connection with the session token in the URL when a session exists', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toContain('/api/me/stream?token=my-token');
  });

  it('(c) registriert je Live-Ereignistyp einen benannten Listener', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });

    expect(FakeEventSource.instances[0]?.listenedTypes().sort()).toEqual(
      [...liveEventTypeSchema.options].sort(),
    );
  });

  it('(d) ein benanntes Event erreicht den Handler und invalidiert today + Beleg-Ansichten', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    FakeEventSource.instances[0]?.emit('case.status', liveEvent('case.status'));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'today'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'case'] });
  });

  it('(d1) position.confirmed invalidiert GENAU das Aggregat dieses Belegs (+ Übersicht)', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    FakeEventSource.instances[0]?.emit(
      'position.confirmed',
      liveEvent('position.confirmed', { positionId: 'pos-1' }),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['me', 'case', 'case-1', 'aggregate'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'today'] });
    // Kein Rundumschlag mehr über ALLE Beleg-Ansichten.
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['me', 'case'] });
  });

  it('(d2) sku.counted lässt das Kästchen des Handelnden aufleuchten', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    FakeEventSource.instances[0]?.emit(
      'sku.counted',
      liveEvent('sku.counted', { actorEmployeeNo: 'ma-2' }),
    );

    const glow = client.getQueryData<GlowMap>(glowQueryKey('case-1'));
    expect(Object.keys(glow ?? {})).toEqual(['ma-2']);
  });

  it('(d3) Zusammenarbeits-Ereignisse ziehen auch den Posteingang nach', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    FakeEventSource.instances[0]?.emit(
      'collaboration.invited',
      liveEvent('collaboration.invited', { actorEmployeeNo: 'ma-2' }),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'nachrichten'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'today'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'case'] });
    // Eine Einladung ist keine Aktion AM Beleg — nichts leuchtet auf.
    expect(client.getQueryData(glowQueryKey('case-1'))).toBeUndefined();
  });

  it('(e) jeder Typ löst die Invalidierung aus (auch Zusammenarbeits-Ereignisse)', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    for (const type of liveEventTypeSchema.options) {
      invalidateSpy.mockClear();
      FakeEventSource.instances[0]?.emit(type);
      expect(invalidateSpy, type).toHaveBeenCalledWith({ queryKey: ['me', 'today'] });
    }
  });

  it('(f) verlässt sich nicht auf onmessage (unbenannte Events kommen vom Server nicht)', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    FakeEventSource.instances[0]?.emitUnnamed();

    expect(FakeEventSource.instances[0]?.onmessage).toBeNull();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('(g) closes the connection on unmount', () => {
    login();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { unmount } = renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    const instance = FakeEventSource.instances[0];
    expect(instance?.closed).toBe(false);

    unmount();

    expect(instance?.closed).toBe(true);
  });
});
