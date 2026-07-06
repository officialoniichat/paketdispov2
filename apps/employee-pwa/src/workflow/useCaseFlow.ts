/**
 * Binds the pure per-Beleg workflow to the live backend (React Query).
 *
 * The aggregate (`case` + work instruction + positions + box targets) is
 * `data/useCaseAggregate.ts` — the backend's single source of truth, no more
 * Dexie mirror. Case-level milestones (start-preparation/complete/
 * partial-complete/issue) optimistically patch the case's status in the
 * `['me','today']` list cache, await the real POST (`data/persist.ts`), then
 * invalidate the affected queries on success — or roll the optimistic patch
 * back on failure and surface the error (never swallowed, see `actionError`).
 *
 * TODO(task-13+): "Position geprüft" and per-Größe confirmed quantities
 * (`CaseProgress.quantityCheckedPositionIds` / `confirmedQuantities`) have no
 * backend endpoint yet (no matching path in `packages/api-client/src/generated/
 * schema.ts`) — the former per-action POST from Dexie's `useCaseFlow` never
 * existed for these two either, only the *first* action's implicit
 * start-preparation call did (see `ensureStarted` below). Until the backend
 * adds real persistence, this progress is tracked as client-only React Query
 * cache state under a `['local', 'caseProgress', caseId]` key, seeded from the
 * loaded aggregate. Unlike the old Dexie table it does not survive a full
 * reload — that matches reality: there is nowhere durable to put it yet.
 */
import { useCallback, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { useCaseAggregate } from '../data/useCaseAggregate.js';
import { mapCaseAggregate } from '../data/caseAggregateMapper.js';
import {
  persistComplete,
  persistIssue,
  persistPartialComplete,
  persistStartPreparation,
  type IssueInput,
} from '../data/persist.js';
import type { CaseAggregate, CaseProgress } from '../domain/types.js';
import {
  completeCase as completeCaseTx,
  hasProgress,
  initialProgress,
  partialComplete as partialCompleteTx,
  setSkuQuantity as setSkuQuantityTx,
  setZst as setZstTx,
  togglePositionChecked as togglePositionCheckedTx,
} from './workflowModel.js';

type TodayResponseDto = components['schemas']['TodayResponseDto'];

export interface CaseFlow {
  loading: boolean;
  isError: boolean;
  error: unknown;
  aggregate?: CaseAggregate;
  progress?: CaseProgress;
  /** Last failed milestone action's message, or undefined. Never swallowed silently. */
  actionError?: string;
  clearActionError: () => void;
  togglePositionChecked: (positionId: string) => void;
  setSkuQuantity: (skuLineId: string, quantity: number, expectedQuantity: number) => void;
  /** Resolves `true` on success, `false` on a surfaced (non-thrown) failure. */
  complete: () => Promise<boolean>;
  partialComplete: (reason: string) => Promise<boolean>;
  reportIssue: (input: IssueInput) => Promise<boolean>;
  refetch: () => void;
}

const TODAY_KEY = ['me', 'today'] as const;

function progressQueryKey(caseId: string): readonly [string, string, string] {
  return ['local', 'caseProgress', caseId] as const;
}

export function useCaseFlow(caseId: string): CaseFlow {
  const queryClient = useQueryClient();
  const aggregateQuery = useCaseAggregate(caseId);
  const aggregate = aggregateQuery.data ? mapCaseAggregate(caseId, aggregateQuery.data) : undefined;
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  const key = progressQueryKey(caseId);
  const progressQuery = useQuery({
    queryKey: key,
    queryFn: () => initialProgress(aggregate as CaseAggregate, new Date().toISOString()),
    enabled: aggregate !== undefined,
    staleTime: Infinity,
  });
  const progress = progressQuery.data;

  const applyLocal = useCallback(
    (transition: (p: CaseProgress) => CaseProgress): void => {
      const current = queryClient.getQueryData<CaseProgress>(key);
      if (!current) return;
      queryClient.setQueryData<CaseProgress>(key, transition(current));
    },
    [queryClient, key],
  );

  /**
   * Optimistically patch the case's status in the `['me','today']` list cache,
   * await the real POST, invalidate on success. On failure, roll the patch
   * back and surface the error via `actionError` — never swallow it.
   */
  const runMilestone = useCallback(
    async (nextStatus: string, post: () => Promise<{ status: string }>): Promise<boolean> => {
      const previousToday = queryClient.getQueryData<TodayResponseDto>(TODAY_KEY);
      if (previousToday) {
        queryClient.setQueryData<TodayResponseDto>(TODAY_KEY, {
          ...previousToday,
          cases: previousToday.cases.map((c) =>
            c.id === caseId ? { ...c, status: nextStatus } : c,
          ),
        });
      }
      try {
        await post();
      } catch (err) {
        if (previousToday) queryClient.setQueryData(TODAY_KEY, previousToday);
        setActionError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen');
        return false;
      }
      setActionError(undefined);
      void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['me', 'case', caseId, 'aggregate'] });
      return true;
    },
    [queryClient, caseId],
  );

  /** First recorded local action → mark the case in_progress on the backend. */
  const ensureStarted = useCallback((): void => {
    const current = queryClient.getQueryData<CaseProgress>(key);
    if (!current || hasProgress(current)) return;
    void runMilestone('in_progress', () => persistStartPreparation(caseId));
  }, [queryClient, key, runMilestone, caseId]);

  const togglePositionChecked = useCallback(
    (positionId: string): void => {
      ensureStarted();
      applyLocal((p) => togglePositionCheckedTx(p, positionId));
    },
    [applyLocal, ensureStarted],
  );

  const setSkuQuantity = useCallback(
    (skuLineId: string, quantity: number, expectedQuantity: number): void => {
      ensureStarted();
      applyLocal((p) => setSkuQuantityTx(p, skuLineId, quantity, expectedQuantity));
    },
    [applyLocal, ensureStarted],
  );

  const complete = useCallback(async (): Promise<boolean> => {
    const ok = await runMilestone('completed', () => persistComplete(caseId));
    if (ok) applyLocal((p) => completeCaseTx(setZstTx(p)));
    return ok;
  }, [runMilestone, applyLocal, caseId]);

  const partialComplete = useCallback(
    async (reason: string): Promise<boolean> => {
      const ok = await runMilestone('partially_completed', () =>
        persistPartialComplete(caseId, reason),
      );
      if (ok) applyLocal((p) => partialCompleteTx(setZstTx(p)));
      return ok;
    },
    [runMilestone, applyLocal, caseId],
  );

  const reportIssue = useCallback(
    async (input: IssueInput): Promise<boolean> => runMilestone('issue_open', () => persistIssue(input)),
    [runMilestone],
  );

  return {
    loading: aggregateQuery.isLoading || (aggregate !== undefined && progressQuery.isLoading),
    isError: aggregateQuery.isError,
    error: aggregateQuery.error,
    aggregate,
    progress,
    actionError,
    clearActionError: () => setActionError(undefined),
    togglePositionChecked,
    setSkuQuantity,
    complete,
    partialComplete,
    reportIssue,
    refetch: () => void aggregateQuery.refetch(),
  };
}
