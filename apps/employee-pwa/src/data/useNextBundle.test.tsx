// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRequestNextBundle } from './useNextBundle.js';
import * as apiModule from './api.js';

function makeWrapper(client: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useRequestNextBundle', () => {
  it('posts /api/me/next-bundle via the api client and invalidates today', async () => {
    const mockPost = vi
      .fn()
      .mockResolvedValue({ data: { assigned: true }, error: undefined, response: { status: 200 } });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({ POST: mockPost } as unknown as ReturnType<
      typeof apiModule.getApiClient
    >);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRequestNextBundle(), { wrapper: makeWrapper(client) });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/api/me/next-bundle');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me', 'today'] });
  });
});
