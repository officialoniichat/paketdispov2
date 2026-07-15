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
 * (`CaseProgress.quantityCheckedPositionIds` / `confirmedQuantities`) still
 * have no live per-action backend endpoint (no matching path in
 * `packages/api-client/src/generated/schema.ts`) — only the *first* action's
 * implicit start-preparation call is persisted immediately (see
 * `ensureStarted` below). Until the backend adds real per-action persistence,
 * this progress is tracked as client-only React Query cache state under a
 * `['local', 'caseProgress', caseId]` key, seeded from the loaded aggregate,
 * and does not survive a full reload.
 *
 * The recorded quantities ARE transferred at the end, though: `complete()`/
 * `partialComplete()` below compute `totalConfirmedQuantity()` (the D2
 * Mehr-/Mindermengen, or the Soll where untouched) and send it as
 * `completedQuantity` on the final POST, so the backend's ZstRecord books the
 * employee's real counted quantity — never silently the untouched case total.
 */
import { useCallback, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { useCaseAggregate } from '../data/useCaseAggregate.js';
import { mapCaseAggregate } from '../data/caseAggregateMapper.js';
import {
  persistComplete,
  persistPartialComplete,
  persistStartPreparation,
} from '../data/persist.js';
import type { CaseAggregate, CaseProgress, RecordedProblem } from '../domain/types.js';
import {
  addProblem as addProblemTx,
  completeCase as completeCaseTx,
  hasProgress,
  initialProgress,
  partialComplete as partialCompleteTx,
  problemsBody,
  removeProblem as removeProblemTx,
  setCorrectedVkPrice as setCorrectedVkPriceTx,
  setSkuQuantity as setSkuQuantityTx,
  setZst as setZstTx,
  skuQuantitiesBody,
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
  /** Preisabweichung (Punkt 4): korrigierter VK je Größe (undefined = keine Korrektur). */
  setCorrectedVkPrice: (
    skuLineId: string,
    price: number | undefined,
    vkLabelPrice: number | undefined,
  ) => void;
  /** Manuell erfasstes Positions-Problem lokal sammeln (Punkt 6). */
  addProblem: (problem: RecordedProblem) => void;
  /** Ein gesammeltes Problem wieder entfernen (vor dem Teilabschluss). */
  removeProblem: (problemId: string) => void;
  /** Resolves `true` on success, `false` on a surfaced (non-thrown) failure. */
  complete: () => Promise<boolean>;
  partialComplete: () => Promise<boolean>;
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

  const setCorrectedVkPrice = useCallback(
    (skuLineId: string, price: number | undefined, vkLabelPrice: number | undefined): void => {
      ensureStarted();
      applyLocal((p) => setCorrectedVkPriceTx(p, skuLineId, price, vkLabelPrice));
    },
    [applyLocal, ensureStarted],
  );

  const addProblem = useCallback(
    (problem: RecordedProblem): void => {
      ensureStarted();
      applyLocal((p) => addProblemTx(p, problem));
    },
    [applyLocal, ensureStarted],
  );

  const removeProblem = useCallback(
    (problemId: string): void => {
      applyLocal((p) => removeProblemTx(p, problemId));
    },
    [applyLocal],
  );

  const complete = useCallback(async (): Promise<boolean> => {
    if (!progress || !aggregate) return false;
    const body = skuQuantitiesBody(progress, aggregate);
    const ok = await runMilestone('completed', () => persistComplete(caseId, body));
    if (ok) applyLocal((p) => completeCaseTx(setZstTx(p)));
    return ok;
  }, [runMilestone, applyLocal, caseId, progress, aggregate]);

  const partialComplete = useCallback(async (): Promise<boolean> => {
    if (!progress || !aggregate) return false;
    const skuBody = skuQuantitiesBody(progress, aggregate);
    const probBody = problemsBody(progress);
    // Der Beleg bleibt beim selben MA rot geparkt (issue_open), bis der Teamlead klärt.
    const ok = await runMilestone('issue_open', () =>
      persistPartialComplete(caseId, skuBody, probBody),
    );
    if (ok) applyLocal((p) => partialCompleteTx(setZstTx(p)));
    return ok;
  }, [runMilestone, applyLocal, caseId, progress, aggregate]);

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
    setCorrectedVkPrice,
    addProblem,
    removeProblem,
    complete,
    partialComplete,
    refetch: () => void aggregateQuery.refetch(),
  };
}
