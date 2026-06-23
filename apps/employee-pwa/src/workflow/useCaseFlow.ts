/**
 * Binds the pure per-Beleg workflow to the local store and event log. Each
 * action applies an immutable transition, persists it under optimistic locking
 * and appends an audit event to the local log; mutating milestones also POST the
 * matching backend transition (best-effort, non-fatal). Reads are live (Dexie
 * useLiveQuery) so the UI always reflects the latest local state.
 *
 * The flow is the collapsed PROCESS phase: print labels (§G.2) → open carton →
 * confirm minimum quantity per position → erledigt (ZST) / Teilabschluss.
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
  checkQuantity as checkQuantityTx,
  completeCase as completeCaseTx,
  markLabelsPrinted as markLabelsPrintedTx,
  openCarton as openCartonTx,
  partialComplete as partialCompleteTx,
  setZst as setZstTx,
} from './workflowModel.js';

export interface CaseFlow {
  loading: boolean;
  aggregate?: CaseAggregate;
  progress?: CaseProgress;
  printLabels: () => Promise<void>;
  openCarton: () => Promise<void>;
  checkQuantity: (positionId: string) => Promise<void>;
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
      if (persist) {
        try {
          const serverVersion = await persist();
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

  const printLabels = useCallback(
    () =>
      commit(
        markLabelsPrintedTx,
        {
          eventType: 'print.job_created',
          entityType: 'case',
          entityId: caseId,
          payload: { jobType: 'price_label' },
        },
        // First PROCESS action → mark the case in_progress on the backend.
        () => persistStartPreparation(caseId),
      ),
    [commit, caseId],
  );

  const openCarton = useCallback(
    () =>
      commit(openCartonTx, {
        eventType: 'case.started',
        entityType: 'case',
        entityId: caseId,
        payload: { step: 'carton_opened' },
      }),
    [commit, caseId],
  );

  const checkQuantity = useCallback(
    (positionId: string) =>
      commit((p) => checkQuantityTx(p, positionId), {
        eventType: 'sku.quantity_confirmed',
        entityType: 'position',
        entityId: positionId,
      }),
    [commit, caseId],
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
    printLabels,
    openCarton,
    checkQuantity,
    complete,
    partialComplete,
    reportIssue,
  };
}
