/**
 * Binds the pure workflow model to the offline store and outbox. Each action
 * applies an immutable transition, persists it under optimistic locking and
 * appends an audit event. Reads are live (Dexie useLiveQuery) so the UI always
 * reflects the latest local state; the SyncEngine ships the events later.
 */
import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AppEventType } from '../offline/types.js';
import { createEventDraft } from '../offline/eventDraft.js';
import { enqueue } from '../offline/outboxStore.js';
import { getAggregate, getProgress, OptimisticLockError, saveProgress } from '../db/repository.js';
import type { CaseAggregate, CaseProgress } from '../db/types.js';
import { buildSkipEvent, type SkipInput } from './skip.js';
import {
  checkQuantity as checkQuantityTx,
  completeCase as completeCaseTx,
  confirmPickup as confirmPickupTx,
  confirmPosition as confirmPositionTx,
  enterComplete,
  markLabelsPrinted as markLabelsPrintedTx,
  markPrepared as markPreparedTx,
  nextBestAction,
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
  markPrepared: () => Promise<void>;
  confirmPosition: (positionId: string) => Promise<void>;
  checkQuantity: (positionId: string) => Promise<void>;
  printBoxLabel: (boxNo: number) => Promise<void>;
  sealBox: (boxNo: number) => Promise<void>;
  putBoxOnConveyor: (boxNo: number) => Promise<void>;
  setZst: () => Promise<void>;
  complete: () => Promise<void>;
  partialComplete: (reason: string) => Promise<void>;
  skip: (input: Omit<SkipInput, 'expectedVersion'>) => Promise<void>;
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
    async (transition: (p: CaseProgress) => CaseProgress, meta: EventMeta): Promise<void> => {
      const current = await getProgress(caseId);
      if (!current) return;
      const next = transition(current);
      try {
        await saveProgress(next, current.version);
        await enqueue(
          createEventDraft({
            eventType: meta.eventType,
            entityType: meta.entityType,
            entityId: meta.entityId,
            expectedVersion: current.version,
            payload: meta.payload,
          }),
        );
      } catch (err) {
        // Stale base: the live query will refresh and the worker retries.
        if (!(err instanceof OptimisticLockError)) throw err;
      }
    },
    [caseId],
  );

  const confirmPickup = useCallback(
    (scannedCode?: string) =>
      commit(confirmPickupTx, {
        eventType: 'pickup.location_scanned',
        entityType: 'case',
        entityId: caseId,
        payload: { scannedCode: scannedCode ?? null },
      }),
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
      commit((p) => completeCaseTx(setZstTx(p)), {
        eventType: 'case.completed',
        entityType: 'case',
        entityId: caseId,
      }),
    [commit, caseId],
  );

  const partialComplete = useCallback(
    (reason: string) =>
      commit((p) => partialCompleteTx(enterComplete(p)), {
        eventType: 'case.partially_completed',
        entityType: 'case',
        entityId: caseId,
        payload: { reason },
      }),
    [commit, caseId],
  );

  const skip = useCallback(
    async (input: Omit<SkipInput, 'expectedVersion'>): Promise<void> => {
      const current = await getProgress(caseId);
      const event = buildSkipEvent({ ...input, expectedVersion: current?.version });
      await enqueue(event);
    },
    [caseId],
  );

  return {
    loading: aggregate === undefined || progress === undefined,
    aggregate,
    progress,
    nextAction: aggregate && progress ? nextBestAction(progress, aggregate) : undefined,
    confirmPickup,
    printLabels,
    markPrepared,
    confirmPosition,
    checkQuantity,
    printBoxLabel,
    sealBox,
    putBoxOnConveyor,
    setZst,
    complete,
    partialComplete,
    skip,
  };
}
