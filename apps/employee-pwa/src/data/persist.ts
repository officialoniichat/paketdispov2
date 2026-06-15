/**
 * Server-side persistence of case transitions for the Mitarbeiter-App.
 *
 * After the local Dexie write, these helpers POST the matching backend
 * transition (§7.1 state machine) so the real ZstRecord / partial completion /
 * issue is written. They return the server's authoritative version from
 * TransitionResultDto so the caller can reconcile the local CaseProgress.
 * In offline-demo mode (no backend) they are no-ops returning undefined.
 */
import type { components } from '@paket/api-client';
import { getApiClient, isBackendEnabled } from './api.js';

type TransitionResultDto = components['schemas']['TransitionResultDto'];

export interface IssueInput {
  caseId: string;
  scope: string;
  issueType: string;
  scopeId?: string;
  description?: string;
  photoKeys?: string[];
}

/** Authoritative server version after a transition, or undefined when offline. */
export type ServerVersion = number | undefined;

function versionOf(result: TransitionResultDto | undefined): ServerVersion {
  return typeof result?.version === 'number' ? result.version : undefined;
}

/** POST /api/cases/:id/start-preparation → assigned→picking; returns version. */
export async function persistStartPreparation(caseId: string): Promise<ServerVersion> {
  if (!isBackendEnabled) return undefined;
  const { data } = await getApiClient().POST('/api/cases/{caseId}/start-preparation', {
    params: { path: { caseId } },
  });
  return versionOf(data);
}

/** POST /api/cases/:id/complete → writes the ZstRecord; returns server version. */
export async function persistComplete(caseId: string): Promise<ServerVersion> {
  if (!isBackendEnabled) return undefined;
  const { data } = await getApiClient().POST('/api/cases/{caseId}/complete', {
    params: { path: { caseId } },
  });
  return versionOf(data);
}

/** POST /api/cases/:id/partial-complete → §4.6 Teilabschluss; returns version. */
export async function persistPartialComplete(
  caseId: string,
  reason: string,
): Promise<ServerVersion> {
  if (!isBackendEnabled) return undefined;
  const { data } = await getApiClient().POST('/api/cases/{caseId}/partial-complete', {
    params: { path: { caseId } },
    body: { reason },
  });
  return versionOf(data);
}

/** POST /api/issues → reports an exception against the case; returns version. */
export async function persistIssue(input: IssueInput): Promise<ServerVersion> {
  if (!isBackendEnabled) return undefined;
  const { data } = await getApiClient().POST('/api/issues', {
    body: {
      caseId: input.caseId,
      scope: input.scope,
      issueType: input.issueType,
      scopeId: input.scopeId,
      description: input.description,
      photoKeys: input.photoKeys,
    },
  });
  return versionOf(data);
}
