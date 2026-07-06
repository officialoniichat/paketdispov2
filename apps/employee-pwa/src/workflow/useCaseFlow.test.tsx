// @vitest-environment jsdom
/**
 * Covers `useCaseFlow`'s `runMilestone` commit/rollback path (see module doc
 * in `useCaseFlow.ts`): a milestone action (here `complete()`) optimistically
 * patches the `['me','today']` list cache, awaits the real POST, and either
 * confirms the optimistic state (success) or rolls it back and surfaces
 * `actionError` (failure) — never swallowing the error.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { useCaseFlow } from './useCaseFlow.js';
import * as apiModule from '../data/api.js';

type CaseAggregateDto = components['schemas']['CaseAggregateDto'];
type TodayResponseDto = components['schemas']['TodayResponseDto'];

const CASE_ID = 'case-1';
const TODAY_KEY = ['me', 'today'] as const;

/** Minimal but structurally valid aggregate DTO — only fields the mapper reads. */
const AGGREGATE_DTO = {
  case: {
    id: CASE_ID,
    weBelegNo: '1234567',
    bookingDate: '2026-07-06',
    branchNo: '1',
    totalQuantity: 1,
    status: 'in_progress',
    estimatedMinutes: 5,
    attentionFlag: false,
    missingFields: [],
    priorityFlags: [],
  },
  workInstruction: {
    priceLabelPrintRequired: false,
    sortByArticleColorSizeRequired: false,
    goodsReceiptCheckMode: 'quantity_only',
    boxLabelRequired: false,
    zstRequired: true,
  },
  positions: [
    {
      id: 'pos-1',
      positionNo: 1,
      wgr: '218110',
      supplierArticleNo: 'art-1',
      supplierColor: 'black',
      branchNo: '1',
      shopNo: '2143',
      instruction: {
        priceLabelRequired: false,
        priceLabelAttachRequired: false,
        securityRequired: false,
        onlineHandlingRequired: false,
      },
      skuLines: [
        {
          id: 'sku-1',
          ean: '4000000000001',
          size: '9',
          expectedQuantity: 1,
          status: 'open',
        },
      ],
      status: 'open',
    },
  ],
  boxTargets: [],
  instructionPoints: [],
} as unknown as CaseAggregateDto;

const TODAY_DTO = {
  date: '2026-07-06',
  cases: [
    {
      id: CASE_ID,
      weBelegNo: '1234567',
      status: 'in_progress',
    },
  ],
} as unknown as TodayResponseDto;

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** The cached case's status, or undefined — avoids unchecked index access on `.cases[0]`. */
function cachedCaseStatus(client: QueryClient): string | undefined {
  return client.getQueryData<TodayResponseDto>(TODAY_KEY)?.cases[0]?.status;
}

describe('useCaseFlow — runMilestone commit/rollback (complete())', () => {
  it('confirms the optimistic status patch once the POST succeeds', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);

    const mockGet = vi.fn().mockResolvedValue({
      data: AGGREGATE_DTO,
      error: undefined,
      response: { status: 200 },
    });
    // Deferred so the test can observe the optimistic state before the POST resolves.
    let resolvePost!: (value: { data: unknown; error: undefined }) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });
    const mockPost = vi.fn().mockReturnValue(postPromise);
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: mockGet,
      POST: mockPost,
    } as unknown as ReturnType<typeof apiModule.getApiClient>);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    let completePromise!: Promise<boolean>;
    act(() => {
      completePromise = result.current.complete();
    });

    // Optimistic patch already applied — before the POST has resolved.
    await waitFor(() => expect(cachedCaseStatus(client)).toBe('completed'));

    resolvePost({ data: { caseId: CASE_ID, status: 'completed', version: 1 }, error: undefined });
    const ok = await completePromise;

    expect(ok).toBe(true);
    // Confirmed, not rolled back, after the mutation settles.
    expect(cachedCaseStatus(client)).toBe('completed');
    await waitFor(() => expect(result.current.actionError).toBeUndefined());
    await waitFor(() => expect(result.current.progress?.step).toBe('done'));
  });

  it('rolls back the optimistic patch and surfaces actionError when the POST fails', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);

    const mockGet = vi.fn().mockResolvedValue({
      data: AGGREGATE_DTO,
      error: undefined,
      response: { status: 200 },
    });
    const mockPost = vi.fn().mockResolvedValue({ data: undefined, error: { message: 'boom' } });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: mockGet,
      POST: mockPost,
    } as unknown as ReturnType<typeof apiModule.getApiClient>);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.complete();
    });

    expect(ok).toBe(false);
    // Rolled back to the pre-mutation status, not left on the optimistic value.
    expect(cachedCaseStatus(client)).toBe('in_progress');
    await waitFor(() => expect(result.current.actionError).toBeTruthy());
    expect(result.current.actionError?.length).toBeGreaterThan(0);
    // Local progress transition (completeCase) must not have been applied either.
    expect(result.current.progress?.step).toBe('process');
  });
});
