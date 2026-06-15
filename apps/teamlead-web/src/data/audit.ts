/**
 * Teamlead override audit (§8.4 Anti-Cherry-Picking, Anhang E.4 "Override mit Grund").
 *
 * Every teamlead intervention – Vorziehen, Parken, Entziehen, Neuverteilen,
 * Freigeben, Priorisieren – may only happen WITH a reason and is recorded as an
 * immutable WorkflowEvent carrying the reason plus the previous and new
 * assignment. Producing an event without a reason is a programming error and
 * throws; the UI enforces this through ReasonDialog before any state change.
 */
import type { WorkflowEvent, WorkflowEventType } from '@paket/domain-types';

export type OverrideAction =
  | 'vorziehen'
  | 'parken'
  | 'entziehen'
  | 'hinzufuegen'
  | 'neuverteilen'
  | 'freigeben'
  | 'priorisieren'
  | 'reihenfolge'
  | 'pause';

/** Human-readable German labels for the confirmation dialog. */
export const OVERRIDE_ACTION_LABELS: Record<OverrideAction, string> = {
  vorziehen: 'Vorziehen',
  parken: 'Parken',
  entziehen: 'Paket entziehen',
  hinzufuegen: 'Paket hinzufügen',
  neuverteilen: 'Neu verteilen',
  freigeben: 'Freigeben',
  priorisieren: 'Priorisieren',
  reihenfolge: 'Reihenfolge ändern',
  pause: 'Pause / Abwesenheit',
};

export interface OverrideInput {
  action: OverrideAction;
  /** The case (or employee for pause) the action targets. */
  entityId: string;
  entityType?: string;
  reason: string;
  actorId: string;
  previousBundleId?: string;
  newBundleId?: string;
  previousState?: string;
  newState?: string;
}

/** Minimum trimmed reason length so "." or " " never counts as a justification. */
export const MIN_REASON_LENGTH = 3;

export class MissingReasonError extends Error {
  constructor(action: OverrideAction) {
    super(`Override "${action}" benötigt einen Grund (mind. ${MIN_REASON_LENGTH} Zeichen).`);
    this.name = 'MissingReasonError';
  }
}

export function isValidReason(reason: string): boolean {
  return reason.trim().length >= MIN_REASON_LENGTH;
}

/** Throws MissingReasonError if the reason is blank/too short. */
export function assertReason(action: OverrideAction, reason: string): void {
  if (!isValidReason(reason)) throw new MissingReasonError(action);
}

const ACTION_EVENT_TYPE: Record<OverrideAction, WorkflowEventType> = {
  vorziehen: 'assignment.overridden',
  parken: 'case.parked',
  entziehen: 'assignment.overridden',
  hinzufuegen: 'assignment.overridden',
  neuverteilen: 'assignment.overridden',
  freigeben: 'case.ready',
  priorisieren: 'case.prioritized',
  reihenfolge: 'assignment.overridden',
  pause: 'assignment.overridden',
};

export interface OverrideEventPayload {
  action: OverrideAction;
  reason: string;
  previousBundleId?: string;
  newBundleId?: string;
  previousState?: string;
  newState?: string;
}

/**
 * Builds the audit event for a teamlead override. The `id`/`timestamp` are
 * generated here for the optimistic UI; the backend assigns the canonical ones
 * and appends to the hash-chained log (§7.2).
 */
export function createOverrideEvent(
  input: OverrideInput,
  now: Date = new Date(),
): WorkflowEvent<OverrideEventPayload> {
  assertReason(input.action, input.reason);
  const payload: OverrideEventPayload = {
    action: input.action,
    reason: input.reason.trim(),
    previousBundleId: input.previousBundleId,
    newBundleId: input.newBundleId,
    previousState: input.previousState,
    newState: input.newState,
  };
  return {
    id: `evt-override-${input.entityId}-${now.getTime()}`,
    eventType: ACTION_EVENT_TYPE[input.action],
    entityType: input.entityType ?? 'case',
    entityId: input.entityId,
    actorType: 'teamlead',
    actorId: input.actorId,
    timestamp: now.toISOString(),
    payload,
  };
}
