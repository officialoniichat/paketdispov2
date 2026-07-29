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
function aggregateDto(status: string): CaseAggregateDto {
  return {
    case: {
      id: CASE_ID,
      weBelegNo: '1234567',
      bookingDate: '2026-07-06',
      branchNo: '1',
      totalQuantity: 1,
      status,
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
}

const AGGREGATE_DTO = aggregateDto('in_progress');

function todayDto(status: string): TodayResponseDto {
  return {
    date: '2026-07-06',
    cases: [
      {
        id: CASE_ID,
        weBelegNo: '1234567',
        status,
      },
    ],
  } as unknown as TodayResponseDto;
}

const TODAY_DTO = todayDto('in_progress');

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

describe('useCaseFlow — ensureStarted fires exactly once on genuinely-first local action', () => {
  it('calls start-preparation when togglePositionChecked runs on a fresh, untouched case', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, todayDto('assigned'));

    // Nur aus `assigned` (bzw. problem_resolved) ist der Start-Übergang legal —
    // exakt dann muss die erste lokale Aktion ihn auch anstoßen.
    const mockGet = vi.fn().mockResolvedValue({
      data: aggregateDto('assigned'),
      error: undefined,
      response: { status: 200 },
    });
    const mockPost = vi
      .fn()
      .mockResolvedValue({ data: { caseId: CASE_ID, status: 'in_progress', version: 1 }, error: undefined });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: mockGet,
      POST: mockPost,
    } as unknown as ReturnType<typeof apiModule.getApiClient>);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());
    // Genuinely untouched: the bug read the already-toggled cache state and
    // never fired start-preparation on the very first action.
    expect(result.current.progress?.quantityCheckedPositionIds).toEqual([]);

    act(() => {
      result.current.togglePositionChecked('pos-1');
    });

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/api/cases/{caseId}/start-preparation',
        expect.objectContaining({ params: { path: { caseId: CASE_ID } } }),
      ),
    );
    expect(mockPost).toHaveBeenCalledTimes(1);
    // The local toggle itself must still have been applied.
    await waitFor(() =>
      expect(result.current.progress?.quantityCheckedPositionIds).toEqual(['pos-1']),
    );
  });

  it('does not call start-preparation again on a second action once progress already exists', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, todayDto('assigned'));

    const mockGet = vi.fn().mockResolvedValue({
      data: aggregateDto('assigned'),
      error: undefined,
      response: { status: 200 },
    });
    const mockPost = vi
      .fn()
      .mockResolvedValue({ data: { caseId: CASE_ID, status: 'in_progress', version: 1 }, error: undefined });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: mockGet,
      POST: mockPost,
    } as unknown as ReturnType<typeof apiModule.getApiClient>);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    // First action — establishes progress and fires start-preparation once.
    act(() => {
      result.current.togglePositionChecked('pos-1');
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.progress?.quantityCheckedPositionIds).toEqual(['pos-1']),
    );

    // Second action — untoggling still leaves confirmedQuantities/quantityCheckedPositionIds
    // touched at some point already, so ensureStarted must not fire again.
    act(() => {
      result.current.togglePositionChecked('pos-1');
    });
    await waitFor(() =>
      expect(result.current.progress?.quantityCheckedPositionIds).toEqual([]),
    );

    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

/**
 * Railway-Bug: ein FERTIGER Beleg (completed) wird erneut geöffnet — die erste
 * lokale Aktion stieß vorher `start-preparation` an und das Backend lehnte mit
 * „Illegal case transition: completed → in_progress" (400) ab. Fertige Belege
 * sind jetzt reine Ansicht: kein Start-Übergang, keine Mutation, kein POST.
 */
describe('useCaseFlow — fertiger Beleg wird geöffnet (read-only)', () => {
  function setup(status: string) {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, todayDto(status));
    const mockGet = vi.fn().mockResolvedValue({
      data: aggregateDto(status),
      error: undefined,
      response: { status: 200 },
    });
    const mockPost = vi.fn().mockResolvedValue({
      data: { caseId: CASE_ID, status: 'in_progress', version: 1 },
      error: undefined,
    });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: mockGet,
      POST: mockPost,
    } as unknown as ReturnType<typeof apiModule.getApiClient>);
    return { client, mockPost };
  }

  it('completed: readOnly, keine Aktion löst einen POST aus, Mutationen sind no-ops', async () => {
    const { client, mockPost } = setup('completed');
    const { result } = renderHook(() => useCaseFlow(CASE_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    expect(result.current.readOnly).toBe(true);

    // Der erste Tipper auf „Position geprüft" darf KEINEN Start-Übergang mehr anstoßen …
    act(() => {
      result.current.togglePositionChecked('pos-1');
    });
    // … und auch lokal nichts verändern (Nur-Ansicht).
    expect(result.current.progress?.quantityCheckedPositionIds).toEqual([]);

    act(() => {
      result.current.setSkuQuantity('sku-1', 3, 1);
    });
    expect(result.current.progress?.confirmedQuantities).toEqual({});

    // „Beleg erledigt"/Teilabschluss sind defensiv abgesichert (UI blendet sie aus).
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.complete();
    });
    expect(ok).toBe(false);

    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.actionError).toBeUndefined();
  });

  it('zst_done: ebenfalls readOnly ohne jeden POST', async () => {
    const { client, mockPost } = setup('zst_done');
    const { result } = renderHook(() => useCaseFlow(CASE_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    expect(result.current.readOnly).toBe(true);
    act(() => {
      result.current.togglePositionChecked('pos-1');
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('in_progress (z. B. nach Reload): bearbeitbar, aber KEIN erneuter Start-Übergang', async () => {
    const { client, mockPost } = setup('in_progress');
    const { result } = renderHook(() => useCaseFlow(CASE_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    expect(result.current.readOnly).toBe(false);

    // Lokale Arbeit bleibt möglich — aber in_progress → in_progress wäre eine
    // illegale Kante, also darf kein start-preparation-POST rausgehen.
    act(() => {
      result.current.togglePositionChecked('pos-1');
    });
    await waitFor(() =>
      expect(result.current.progress?.quantityCheckedPositionIds).toEqual(['pos-1']),
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});
