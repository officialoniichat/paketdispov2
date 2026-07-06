// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParkRemaining } from './useParkRemaining.js';
import * as apiModule from './api.js';

function makeWrapper(client: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useParkRemaining', () => {
  it('posts /api/me/park via the api client and invalidates today', async () => {
    const result_ = {
      bundleId: 'bundle-1',
      parkedCaseIds: ['case-1'],
      remainingCaseIds: [],
      plannedEffortMinutes: 0,
    };
    const mockPost = vi.fn().mockResolvedValue({ data: result_, error: undefined, response: { status: 200 } });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({ POST: mockPost } as unknown as ReturnType<
      typeof apiModule.getApiClient
    >);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useParkRemaining(), { wrapper: makeWrapper(client) });

    result.current.mutate({ caseIds: ['case-1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/api/me/park', { body: { caseIds: ['case-1'] } });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'today'] });
  });
});
