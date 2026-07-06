/**
 * Binds the pure per-Beleg workflow to the local store and event log. Each
 * action applies an immutable transition, persists it under optimistic locking
 * and appends an audit event to the local log; mutating milestones also POST the
 * matching backend transition (best-effort, non-fatal). Reads are live (Dexie
 * useLiveQuery) so the UI always reflects the latest local state.
 *
 * The flow is the collapsed PROCESS phase: „Position geprüft" per position
 * (toggleable, D5) + Mehr-/Mindermengen per Größe (D2) → erledigt (ZST) /
 * Teilabschluss. The first recorded action marks the case in_progress on the
 * backend (start-preparation).
 */
import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AppEventType } from '../events/types.js';
import { createEventDraft } from '../events/eventDraft.js';
import { append } from '../events/eventLog.js';
import {
  getAggregate,
  getProgress,
  OptimisticLockError,
  reconcileVersion,
  saveProgress,
} from '../db/repository.js';
import type { CaseAggregate, CaseProgress } from '../db/types.js';
import {
  persistComplete,
  persistIssue,
  persistPartialComplete,
  persistStartPreparation,
  type IssueInput,
} from '../data/persist.js';
import {
  completeCase as completeCaseTx,
  hasProgress,
  partialComplete as partialCompleteTx,
  setSkuQuantity as setSkuQuantityTx,
  setZst as setZstTx,
  togglePositionChecked as togglePositionCheckedTx,
} from './workflowModel.js';

export interface CaseFlow {
  loading: boolean;
  aggregate?: CaseAggregate;
  progress?: CaseProgress;
  togglePositionChecked: (positionId: string) => Promise<void>;
  setSkuQuantity: (skuLineId: string, quantity: number, expectedQuantity: number) => Promise<void>;
  complete: () => Promise<void>;
  partialComplete: (reason: string) => Promise<void>;
  reportIssue: (input: IssueInput) => Promise<void>;
}

interface EventMeta {
  eventType: AppEventType;
  entityType: string;
  entityId: string;
  payload?: unknown;
}

export function useCaseFlow(caseId: string): CaseFlow {
  const aggregate = useLiveQuery(() => getAggregate(caseId), [caseId]);
  const progress = useLiveQuery(() => getProgress(caseId), [caseId]);

  const commit = useCallback(
    async (
      transition: (p: CaseProgress) => CaseProgress,
      meta: EventMeta,
      /**
       * Optional backend persistence run AFTER the local write succeeds. Returns
       * the server's authoritative version (or undefined offline), reconciled
       * into the local row. A failing POST is non-fatal: local state and the
       * event log are kept so the action can be retried.
       */
      persist?: () => Promise<number | undefined>,
    ): Promise<void> => {
      const current = await getProgress(caseId);
      if (!current) return;
      const next = transition(current);
      // First recorded action → mark the case in_progress on the backend.
      const isFirstAction = !hasProgress(current) && hasProgress(next);
      try {
        await saveProgress(next, current.version);
        await append(
          createEventDraft({
            eventType: meta.eventType,
            entityType: meta.entityType,
            entityId: meta.entityId,
            payload: meta.payload,
          }),
        );
      } catch (err) {
        // Stale base: the live query will refresh and the action can be retried.
        if (!(err instanceof OptimisticLockError)) throw err;
        return;
      }
      const persistStep = isFirstAction ? () => persistStartPreparation(caseId) : persist;
      if (persistStep) {
        try {
          const serverVersion = await persistStep();
          if (typeof serverVersion === 'number') {
            await reconcileVersion(caseId, serverVersion);
          }
        } catch {
          // Non-fatal: local state persists; surface nothing destructive.
        }
      }
    },
    [caseId],
  );

  const togglePositionChecked = useCallback(
    (positionId: string) =>
      commit((p) => togglePositionCheckedTx(p, positionId), {
        eventType: 'position.confirmed',
        entityType: 'position',
        entityId: positionId,
      }),
    [commit],
  );

  const setSkuQuantity = useCallback(
    (skuLineId: string, quantity: number, expectedQuantity: number) =>
      commit((p) => setSkuQuantityTx(p, skuLineId, quantity, expectedQuantity), {
        eventType: 'sku.quantity_confirmed',
        entityType: 'sku_line',
        entityId: skuLineId,
        payload: { confirmedQuantity: quantity, expectedQuantity },
      }),
    [commit],
  );

  const complete = useCallback(
    () =>
      commit(
        (p) => completeCaseTx(setZstTx(p)),
        { eventType: 'case.completed', entityType: 'case', entityId: caseId },
        () => persistComplete(caseId),
      ),
    [commit, caseId],
  );

  const partialComplete = useCallback(
    (reason: string) =>
      commit(
        (p) => partialCompleteTx(setZstTx(p)),
        {
          eventType: 'case.partially_completed',
          entityType: 'case',
          entityId: caseId,
          payload: { reason },
        },
        () => persistPartialComplete(caseId, reason),
      ),
    [commit, caseId],
  );

  const reportIssue = useCallback(async (input: IssueInput): Promise<void> => {
    // Local audit record first, then best-effort server persist (non-fatal).
    await append(
      createEventDraft({
        eventType: 'issue.created',
        entityType: 'case',
        entityId: input.caseId,
        payload: input,
      }),
    );
    try {
      await persistIssue(input);
    } catch {
      // Non-fatal: the local issue record is kept.
    }
  }, []);

  return {
    loading: aggregate === undefined || progress === undefined,
    aggregate,
    progress,
    togglePositionChecked,
    setSkuQuantity,
    complete,
    partialComplete,
    reportIssue,
  };
}
