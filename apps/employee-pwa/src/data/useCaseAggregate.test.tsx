// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCaseAggregate } from './useCaseAggregate.js';
import * as apiModule from './api.js';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCaseAggregate', () => {
  it('fetches /api/me/cases/{caseId}/aggregate via the api client', async () => {
    const aggregate = {
      case: { id: 'case-1' },
      positions: [],
      boxTargets: [],
      instructionPoints: [],
    };
    const mockGet = vi.fn().mockResolvedValue({ data: aggregate, error: undefined, response: { status: 200 } });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({ GET: mockGet } as unknown as ReturnType<
      typeof apiModule.getApiClient
    >);

    const { result } = renderHook(() => useCaseAggregate('case-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/api/me/cases/{caseId}/aggregate', {
      params: { path: { caseId: 'case-1' } },
    });
    expect(result.current.data).toEqual(aggregate);
  });
});
