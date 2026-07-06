// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMeToday } from './useMeToday.js';
import * as apiModule from './api.js';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMeToday', () => {
  it('fetches /api/me/today via the api client', async () => {
    const mockGet = vi
      .fn()
      .mockResolvedValue({ data: { date: '2026-07-06', cases: [] }, error: undefined, response: { status: 200 } });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({ GET: mockGet } as unknown as ReturnType<
      typeof apiModule.getApiClient
    >);

    const { result } = renderHook(() => useMeToday(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/api/me/today');
    expect(result.current.data).toEqual({ date: '2026-07-06', cases: [] });
  });
});
