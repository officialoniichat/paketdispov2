/**
 * Server persistence of case transitions for the Mitarbeiter-App.
 *
 * Every `persist*` function here IS the write — there is no more local Dexie
 * write happening first (that db is gone, see task-10/task-13). Each POSTs the
 * matching backend transition (§7.1 state machine) and returns the server's
 * authoritative `TransitionResultDto` (case id, new status, version). A failed
 * request throws: callers (see `workflow/useCaseFlow.ts`) must handle it
 * explicitly — nothing here swallows an error.
 */
import type { components } from '@paket/api-client';
import type { IssueScope, IssueType } from '@paket/domain-types';
import { getApiClient } from './api.js';

export type TransitionResultDto = components['schemas']['TransitionResultDto'];

export interface IssueInput {
  caseId: string;
  /** What the problem is reported against (case/position/sku_line/transport_box). */
  scope: IssueScope;
  issueType: IssueType;
  /** Id of the scoped entity (position/sku/box); omitted for case-level. */
  scopeId?: string;
  description?: string;
  photoKeys?: string[];
}

interface ApiResult<T> {
  data?: T;
  error?: unknown;
}

/** Unwrap an openapi-fetch result, throwing on any non-2xx/error response. */
function unwrap(label: string, result: ApiResult<TransitionResultDto>): TransitionResultDto {
  if (result.error || !result.data) {
    throw new Error(`${label} fehlgeschlagen (${JSON.stringify(result.error)})`);
  }
  return result.data;
}

/** POST /api/cases/:id/start-preparation → assigned → in_progress. */
export async function persistStartPreparation(caseId: string): Promise<TransitionResultDto> {
  return unwrap(
    'Start',
    await getApiClient().POST('/api/cases/{caseId}/start-preparation', {
      params: { path: { caseId } },
    }),
  );
}

/**
 * POST /api/cases/:id/complete → writes the ZstRecord.
 *
 * `completedQuantity` is the employee's actual counted total (incl. D2
 * Mehr-/Mindermengen, see `workflow/workflowModel.ts`'s `totalConfirmedQuantity`)
 * — omit it only when there is no progress state to derive it from; the
 * backend then falls back to the case's Soll total.
 */
export async function persistComplete(
  caseId: string,
  completedQuantity?: number,
): Promise<TransitionResultDto> {
  return unwrap(
    'Abschluss',
    await getApiClient().POST('/api/cases/{caseId}/complete', {
      params: { path: { caseId } },
      body: { completedQuantity },
    }),
  );
}

/** POST /api/cases/:id/partial-complete → §4.6 Teilabschluss. */
export async function persistPartialComplete(
  caseId: string,
  reason: string,
  completedQuantity?: number,
): Promise<TransitionResultDto> {
  return unwrap(
    'Teilabschluss',
    await getApiClient().POST('/api/cases/{caseId}/partial-complete', {
      params: { path: { caseId } },
      body: { reason, completedQuantity },
    }),
  );
}

/** POST /api/issues → reports an exception against the case (§9.7). */
export async function persistIssue(input: IssueInput): Promise<TransitionResultDto> {
  return unwrap(
    'Problem melden',
    await getApiClient().POST('/api/issues', {
      body: {
        caseId: input.caseId,
        scope: input.scope,
        issueType: input.issueType,
        scopeId: input.scopeId,
        description: input.description,
        photoKeys: input.photoKeys,
      },
    }),
  );
}
