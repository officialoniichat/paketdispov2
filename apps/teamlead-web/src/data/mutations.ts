/**
 * Centralized, fully-typed teamlead mutation calls (§8.4 audited overrides + §E.4
 * simulation/commit). Each function uses the generated @paket/api-client request
 * and response types, unwraps openapi-fetch's `{ data, error }` result, and throws
 * a typed {@link MutationError} so TanStack Query's `onError` can roll back and a
 * snackbar can surface the message. No `any`, no non-null assertions.
 */
import type { PaketApiClient, components } from '@paket/api-client';
import { hasFetchError } from './http.js';
import type { PreviewResult } from './types.js';

type WithdrawDto = components['schemas']['WithdrawDto'];
type AddToBundleDto = components['schemas']['AddToBundleDto'];
type AssignToEmployeeDto = components['schemas']['AssignToEmployeeDto'];
type ReorderBundleDto = components['schemas']['ReorderBundleDto'];
type BundlePauseDto = components['schemas']['BundlePauseDto'];
type RecalculateDto = components['schemas']['RecalculateDto'];
type BundleMutationResultDto = components['schemas']['BundleMutationResultDto'];
type RecalculateResultDto = components['schemas']['RecalculateResultDto'];

/** Raised when a teamlead mutation fails; carries the operation label for the toast. */
export class MutationError extends Error {
  constructor(
    public readonly operation: string,
    cause: unknown,
  ) {
    super(`${operation} fehlgeschlagen (${describeCause(cause)})`);
    this.name = 'MutationError';
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (cause === undefined || cause === null) return 'unbekannter Fehler';
  return JSON.stringify(cause);
}

/** Throw on the openapi-fetch error channel or a missing body; otherwise return data. */
function ensure<T>(operation: string, result: { data?: T; error?: unknown }): T {
  if (hasFetchError(result) || result.data === undefined) {
    throw new MutationError(operation, result.error);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// §8.4 Audited bundle interventions
// ---------------------------------------------------------------------------

export interface WithdrawArgs {
  bundleId: string;
  caseId: string;
  reason: string;
}

export async function withdrawCase(
  api: PaketApiClient,
  { bundleId, caseId, reason }: WithdrawArgs,
): Promise<BundleMutationResultDto> {
  const body: WithdrawDto = { caseId, reason };
  return ensure(
    'Entziehen',
    await api.POST('/api/teamlead/bundles/{bundleId}/withdraw', {
      params: { path: { bundleId } },
      body,
    }),
  );
}

export interface AddToBundleArgs {
  bundleId: string;
  caseId: string;
  /** Optional §8.4 audit reason; omitted (not sent as '') when empty. */
  reason?: string;
}

export async function addCaseToBundle(
  api: PaketApiClient,
  { bundleId, caseId, reason }: AddToBundleArgs,
): Promise<BundleMutationResultDto> {
  const body: AddToBundleDto = { caseId, ...(reason ? { reason } : {}) };
  return ensure(
    'Hinzufügen',
    await api.POST('/api/teamlead/bundles/{bundleId}/add', {
      params: { path: { bundleId } },
      body,
    }),
  );
}

export interface AssignToEmployeeArgs {
  employeeNo: string;
  caseId: string;
  /** Optional §8.4 audit reason; omitted (not sent as '') when empty. */
  reason?: string;
  /** Operational day of the board (YYYY-MM-DD); the Bündel is bound to this day. */
  date: string;
}

/**
 * §8.4 audited manual override: assign a ready Beleg to an employee. If the employee
 * has no Bündel for the day yet, the backend creates it and places the Beleg as its
 * first member (find-or-create); otherwise the Beleg is appended. The engine stays
 * single-source for the automatic plan — this is an override.
 */
export async function assignToEmployee(
  api: PaketApiClient,
  { employeeNo, caseId, reason, date }: AssignToEmployeeArgs,
): Promise<BundleMutationResultDto> {
  const body: AssignToEmployeeDto = { caseId, date, ...(reason ? { reason } : {}) };
  return ensure(
    'Beleg zuweisen',
    await api.POST('/api/teamlead/employees/{employeeNo}/assign', {
      params: { path: { employeeNo } },
      body,
    }),
  );
}

export interface ReorderArgs {
  bundleId: string;
  caseIds: string[];
  reason: string;
}

export async function reorderBundle(
  api: PaketApiClient,
  { bundleId, caseIds, reason }: ReorderArgs,
): Promise<BundleMutationResultDto> {
  const body: ReorderBundleDto = { caseIds, reason };
  return ensure(
    'Reihenfolge speichern',
    await api.POST('/api/teamlead/bundles/{bundleId}/reorder', {
      params: { path: { bundleId } },
      body,
    }),
  );
}

export interface BundlePauseArgs {
  bundleId: string;
  reason: string;
}

export async function pauseBundle(
  api: PaketApiClient,
  { bundleId, reason }: BundlePauseArgs,
): Promise<BundleMutationResultDto> {
  const body: BundlePauseDto = { reason };
  return ensure(
    'Pause',
    await api.POST('/api/teamlead/bundles/{bundleId}/pause', {
      params: { path: { bundleId } },
      body,
    }),
  );
}

export async function resumeBundle(
  api: PaketApiClient,
  { bundleId, reason }: BundlePauseArgs,
): Promise<BundleMutationResultDto> {
  const body: BundlePauseDto = { reason };
  return ensure(
    'Pause beenden',
    await api.POST('/api/teamlead/bundles/{bundleId}/resume', {
      params: { path: { bundleId } },
      body,
    }),
  );
}

// ---------------------------------------------------------------------------
// §E.4 Simulation (preview = dry-run) and commit (recalculate = persist)
// ---------------------------------------------------------------------------

function toPreviewResult(dto: RecalculateResultDto): PreviewResult {
  return {
    date: dto.date,
    bundleCount: dto.bundleCount,
    assignedCaseCount: dto.assignedCaseCount,
    unassignedCaseCount: dto.unassignedCaseCount,
    durationMs: dto.durationMs,
    loads: dto.loads.map((load) => ({
      employeeId: load.employeeId,
      capacityMinutes: load.capacityMinutes,
      assignedMinutes: load.assignedMinutes,
      assignedPoints: load.assignedPoints,
      bundleCount: load.bundleCount,
    })),
  };
}

/** Run the engine over the ready pool WITHOUT persisting (no bundles, no events). */
export async function previewAssignment(api: PaketApiClient, date: string): Promise<PreviewResult> {
  const body: RecalculateDto = { date };
  return toPreviewResult(
    ensure('Simulation', await api.POST('/api/teamlead/assignments/preview', { body })),
  );
}

/** Persist a fresh assignment-engine run (the real "Live zuweisen"). */
export async function commitAssignment(
  api: PaketApiClient,
  date: string,
): Promise<RecalculateResultDto> {
  const body: RecalculateDto = { date };
  return ensure('Neuberechnung', await api.POST('/api/teamlead/assignments/recalculate', { body }));
}
