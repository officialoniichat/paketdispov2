/**
 * Binds the pure workflow model to the local store and event log. Each action
 * applies an immutable transition, persists it under optimistic locking and
 * appends an audit event to the local log. Reads are live (Dexie useLiveQuery)
 * so the UI always reflects the latest local state.
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
import { buildSkipEvent, type SkipInput } from './skip.js';
import {
  checkQuantity as checkQuantityTx,
  completeCase as completeCaseTx,
  confirmBoxAssignment as confirmBoxAssignmentTx,
  confirmPickup as confirmPickupTx,
  confirmPosition as confirmPositionTx,
  enterComplete,
  markLabelsPrinted as markLabelsPrintedTx,
  markPrepared as markPreparedTx,
  nextBestAction,
  openCarton as openCartonTx,
  partialComplete as partialCompleteTx,
  printBoxLabel as printBoxLabelTx,
  putBoxOnConveyor as putBoxOnConveyorTx,
  sealBox as sealBoxTx,
  setZst as setZstTx,
  type NextAction,
} from './workflowModel.js';

export interface CaseFlow {
  loading: boolean;
  aggregate?: CaseAggregate;
  progress?: CaseProgress;
  nextAction?: NextAction;
  confirmPickup: (scannedCode?: string) => Promise<void>;
  printLabels: () => Promise<void>;
  openCarton: () => Promise<void>;
  markPrepared: () => Promise<void>;
  confirmPosition: (positionId: string) => Promise<void>;
  checkQuantity: (positionId: string) => Promise<void>;
  confirmBoxAssignment: () => Promise<void>;
  printBoxLabel: (boxNo: number) => Promise<void>;
  sealBox: (boxNo: number) => Promise<void>;
  putBoxOnConveyor: (boxNo: number) => Promise<void>;
  setZst: () => Promise<void>;
  complete: () => Promise<void>;
  partialComplete: (reason: string) => Promise<void>;
  reportIssue: (input: IssueInput) => Promise<void>;
  skip: (input: SkipInput) => Promise<void>;
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
       * Optional backend persistence run AFTER the local write succeeds. It
       * returns the server's authoritative version (or undefined offline) which
       * is reconciled into the local row. A failing POST is non-fatal: the local
       * state and event log are kept so the action can be retried.
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

  const confirmPickup = useCallback(
    (scannedCode?: string) =>
      commit(
        confirmPickupTx,
        {
          eventType: 'pickup.location_scanned',
          entityType: 'case',
          entityId: caseId,
          payload: { scannedCode: scannedCode ?? null },
        },
        // Mark the case in-progress on the backend (assigned → picking).
        () => persistStartPreparation(caseId),
      ),
    [commit, caseId],
  );

  const printLabels = useCallback(
    () =>
      commit(markLabelsPrintedTx, {
        eventType: 'print.job_created',
        entityType: 'case',
        entityId: caseId,
        payload: { jobType: 'price_label' },
      }),
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

  const markPrepared = useCallback(
    () =>
      commit(markPreparedTx, { eventType: 'case.started', entityType: 'case', entityId: caseId }),
    [commit, caseId],
  );

  const confirmPosition = useCallback(
    (positionId: string) =>
      commit((p) => confirmPositionTx(p, positionId), {
        eventType: 'position.confirmed',
        entityType: 'position',
        entityId: positionId,
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

  const confirmBoxAssignment = useCallback(
    () =>
      commit(confirmBoxAssignmentTx, {
        eventType: 'case.started',
        entityType: 'case',
        entityId: caseId,
        payload: { step: 'box_assignment_confirmed' },
      }),
    [commit, caseId],
  );

  const printBoxLabel = useCallback(
    (boxNo: number) =>
      commit((p) => printBoxLabelTx(p, boxNo), {
        eventType: 'box.label_printed',
        entityType: 'transport_box',
        entityId: `${caseId}-box-${boxNo}`,
      }),
    [commit, caseId],
  );

  const sealBox = useCallback(
    (boxNo: number) =>
      commit((p) => sealBoxTx(p, boxNo), {
        eventType: 'box.sealed',
        entityType: 'transport_box',
        entityId: `${caseId}-box-${boxNo}`,
      }),
    [commit, caseId],
  );

  const putBoxOnConveyor = useCallback(
    (boxNo: number) =>
      commit((p) => putBoxOnConveyorTx(p, boxNo), {
        eventType: 'box.sealed',
        entityType: 'transport_box',
        entityId: `${caseId}-box-${boxNo}`,
        payload: { onConveyor: true },
      }),
    [commit, caseId],
  );

  const setZst = useCallback(
    () => commit(setZstTx, { eventType: 'zst.created', entityType: 'case', entityId: caseId }),
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
        (p) => partialCompleteTx(enterComplete(p)),
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

  const reportIssue = useCallback(
    async (input: IssueInput): Promise<void> => {
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
    },
    [],
  );

  const skip = useCallback(
    async (input: SkipInput): Promise<void> => {
      const event = buildSkipEvent(input);
      await append(event);
    },
    [],
  );

  return {
    loading: aggregate === undefined || progress === undefined,
    aggregate,
    progress,
    nextAction: aggregate && progress ? nextBestAction(progress, aggregate) : undefined,
    confirmPickup,
    printLabels,
    openCarton,
    markPrepared,
    confirmPosition,
    checkQuantity,
    confirmBoxAssignment,
    printBoxLabel,
    sealBox,
    putBoxOnConveyor,
    setZst,
    complete,
    partialComplete,
    reportIssue,
    skip,
  };
}
