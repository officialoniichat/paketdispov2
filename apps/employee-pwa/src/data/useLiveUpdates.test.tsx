// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLiveUpdates } from './useLiveUpdates.js';
import { clearSession, setSession } from './session.js';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emitMessage(): void {
    this.onmessage?.({} as MessageEvent);
  }
}

function makeWrapper(client: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useLiveUpdates', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('(a) does nothing when there is no session', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('(b) opens a connection with the session token in the URL when a session exists', () => {
    setSession({ token: 'my-token', employeeNo: 'ma-1', displayName: 'Test', exp: Date.now() / 1000 + 3600 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toContain('/api/me/stream?token=my-token');
  });

  it('(c) invalidates [\'me\',\'today\'] when a message is received', () => {
    setSession({ token: 'my-token', employeeNo: 'ma-1', displayName: 'Test', exp: Date.now() / 1000 + 3600 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    FakeEventSource.instances[0]?.emitMessage();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'today'] });
  });

  it('(d) closes the connection on unmount', () => {
    setSession({ token: 'my-token', employeeNo: 'ma-1', displayName: 'Test', exp: Date.now() / 1000 + 3600 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { unmount } = renderHook(() => useLiveUpdates(), { wrapper: makeWrapper(client) });
    const instance = FakeEventSource.instances[0];
    expect(instance?.closed).toBe(false);

    unmount();

    expect(instance?.closed).toBe(true);
  });

  afterEach(() => clearSession());
});
