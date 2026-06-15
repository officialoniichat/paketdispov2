/**
 * Backend client singleton for the teamlead cockpit (§12.2 REST/OpenAPI).
 *
 * Wraps @paket/api-client's openapi-fetch client with the dev base URL + bearer
 * token from Vite env. The teamlead actor id is derived from the same token so
 * optimistic audit entries carry the right `actorId` (§8.4).
 */
import { createApiClient } from '@paket/api-client';
import { resolveCurrentTeamleadId } from './session.js';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const token = import.meta.env.VITE_DEV_TOKEN;

/** Shared, fully typed backend client. */
export const api = createApiClient({ baseUrl, token });

/** Logged-in teamlead; from the OIDC subject in prod, the dev token here. */
export const CURRENT_TEAMLEAD_ID = resolveCurrentTeamleadId(token);
