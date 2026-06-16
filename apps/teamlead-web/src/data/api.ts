/**
 * Backend client singleton for the teamlead cockpit (§12.2 REST/OpenAPI).
 *
 * Wraps @paket/api-client's openapi-fetch client with the dev base URL + bearer
 * token from Vite env. The teamlead actor id is derived from the same token so
 * optimistic audit entries carry the right `actorId` (§8.4).
 */
import { createApiClient } from '@paket/api-client';
import { resolveEnv } from '../config/runtimeEnv.js';
import { resolveCurrentTeamleadId } from './session.js';

// resolveEnv reads the runtime value (window.__ENV__ from /env.js) first, then the
// build-time import.meta.env, then this localhost default — so the deployed cockpit
// talks to the Railway backend without a rebuild. See src/config/runtimeEnv.ts.
// Trailing slash stripped so openapi-fetch never builds `…app//api/...` (a double
// slash 404s on Fastify) when the dashboard value ends with "/".
const baseUrl = (resolveEnv('VITE_API_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
const token = resolveEnv('VITE_DEV_TOKEN');

/** Shared, fully typed backend client. */
export const api = createApiClient({ baseUrl, token });

/** Logged-in teamlead; from the OIDC subject in prod, the dev token here. */
export const CURRENT_TEAMLEAD_ID = resolveCurrentTeamleadId(token);
