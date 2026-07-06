/**
 * Teamlead override audit (§8.4 Anti-Cherry-Picking, Anhang E.4 "Override mit Grund").
 *
 * Every teamlead intervention – Vorziehen, Parken, Entziehen, Neuverteilen,
 * Freigeben, Priorisieren – may only happen WITH a reason and is recorded as an
 * immutable WorkflowEvent carrying the reason plus the previous and new
 * assignment. Producing an event without a reason is a programming error and
 * throws; the UI enforces this through ReasonDialog before any state change.
 */
import type { ActorType, WorkflowEvent, WorkflowEventType } from '@paket/domain-types';

export type OverrideAction =
  | 'vorziehen'
  | 'parken'
  | 'entziehen'
  | 'hinzufuegen'
  | 'manual_assign'
  | 'neuverteilen'
  | 'aufteilen'
  | 'freigeben'
  | 'priorisieren'
  | 'reihenfolge'
  | 'pause';

/** Human-readable German labels for the confirmation dialog. */
export const OVERRIDE_ACTION_LABELS: Record<OverrideAction, string> = {
  vorziehen: 'Vorziehen',
  parken: 'Parken',
  entziehen: 'Beleg entziehen',
  hinzufuegen: 'Beleg zuweisen',
  // Manuelle Zuweisung „Beleg → Mitarbeiter" vom Mitarbeiterboard (Bündel ggf. neu).
  manual_assign: 'Beleg zuweisen',
  neuverteilen: 'Neu verteilen',
  aufteilen: 'Beleg aufteilen',
  freigeben: 'Freigeben',
  priorisieren: 'Priorisieren',
  reihenfolge: 'Reihenfolge ändern',
  pause: 'Pause / Abwesenheit',
};

/**
 * German label for every WorkflowEventType, so the audit feed never shows a raw
 * machine code. Exhaustive by construction: this is a total `Record` over the
 * domain enum, so adding an event type fails to compile until it is labelled —
 * there is no catch-all, because the event type cannot be anything else.
 */
export const AUDIT_EVENT_LABELS: Record<WorkflowEventType, string> = {
  'case.ready': 'Freigegeben',
  'case.parked': 'Geparkt',
  'case.prioritized': 'Priorisiert',
  'case.deprioritized': 'Priorität entfernt',
  'case.cancelled': 'Storniert',
  'bundle.created': 'Bündel gebildet',
  'bundle.assigned': 'Bündel zugeteilt',
  'bundle.completed': 'Bündel abgeschlossen',
  'pickup.location_scanned': 'Lagerplatz gescannt',
  'case.started': 'Bearbeitung gestartet',
  'position.confirmed': 'Position bestätigt',
  'sku.quantity_confirmed': 'Menge bestätigt',
  'issue.created': 'Problem gemeldet',
  'issue.resolved': 'Problem gelöst',
  'box.label_printed': 'Etikett gedruckt',
  'box.sealed': 'Box verschlossen',
  'print.job_created': 'Druckauftrag erstellt',
  'print.job_completed': 'Druck fertig',
  'print.job_failed': 'Druck fehlgeschlagen',
  'case.completed': 'Abgeschlossen',
  'case.partially_completed': 'Teilabschluss',
  'zst.created': 'ZST erfasst',
  'zst.exported': 'ZST exportiert',
  'assignment.overridden': 'Neu zugeteilt',
  'case.delivery_group_merged': 'Lieferung zusammengeführt',
  'case.delivery_group_split': 'Lieferung getrennt',
  'employee.created': 'Mitarbeiter angelegt',
  'employee.profile_updated': 'Stammdaten geändert',
  'employee.shift_overridden': 'Schicht geändert',
  'employee.workstation_assigned': 'Arbeitsplatz zugewiesen',
  'integration.pull_completed': 'ProHandel-Pull abgeschlossen',
  'case.intake_blocked': 'Intake blockiert (zurück an Bucher)',
  'case.returned_to_bucher': 'An Bucher gemeldet',
  'case.intake_released': 'Intake freigegeben',
  'case.delivery_group_released': 'Lieferung trotzdem freigegeben',
};

/** German label for each actor, so the audit feed never shows the raw role token. */
export const ACTOR_LABELS: Record<ActorType, string> = {
  system: 'System',
  employee: 'Mitarbeiter',
  teamlead: 'Teamlead',
  admin: 'Admin',
};

/**
 * Narrow the optional, free-form audit `action` to a known OverrideAction. The
 * field is legitimately absent for non-override events; this only recognises the
 * override vocabulary and returns undefined otherwise — it makes no assumption
 * that the data is malformed.
 */
export function toOverrideAction(value: string | null | undefined): OverrideAction | undefined {
  return value != null && value in OVERRIDE_ACTION_LABELS ? (value as OverrideAction) : undefined;
}

/**
 * The single human-readable label for one audit row. Prefers the specific override
 * action (e.g. "Beleg entziehen") and otherwise uses the event-type label. Reused
 * by the cockpit feed, the Beleg-Historie and the Mitarbeiter-Audit.
 */
export function formatAuditAction(eventType: WorkflowEventType, action?: OverrideAction): string {
  return action ? OVERRIDE_ACTION_LABELS[action] : AUDIT_EVENT_LABELS[eventType];
}

/** Audit payload the teamlead surfaces read (the only fields projected by the API). */
export interface AuditPayload {
  action?: OverrideAction;
  reason?: string;
}

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
  manual_assign: 'assignment.overridden',
  neuverteilen: 'assignment.overridden',
  aufteilen: 'assignment.overridden',
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
