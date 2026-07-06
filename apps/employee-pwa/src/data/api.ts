/**
 * Live backend client for the Mitarbeiter-App.
 *
 * `@paket/api-client`'s `createApiClient` bakes its bearer token into a static
 * `Authorization` header at construction time (see `packages/api-client/src/client.ts`) —
 * it has no per-request token getter. To make sure every request uses the
 * *current* session token (not a stale one captured before login, or before a
 * re-login after logout) we deliberately do NOT cache the client: `getApiClient()`
 * builds a fresh `openapi-fetch` client from the live session on every call.
 * Constructing an openapi-fetch client is cheap (no network I/O), so this has no
 * meaningful performance cost.
 */
import { createApiClient, type PaketApiClient } from '@paket/api-client';
import { resolveEnv } from '../config/runtimeEnv.js';
import { getSession } from './session.js';

// resolveEnv reads the runtime value (window.__ENV__ from /env.js) first, then the
// build-time import.meta.env. On Railway this lets the deployed app point at the
// real backend without a rebuild. See src/config/runtimeEnv.ts.

/** Backend base URL. Trailing slash stripped so openapi-fetch never builds a
 *  double-slash URL that 404s on Fastify. */
export const apiBaseUrl: string = (resolveEnv('VITE_API_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Typed client against the configured backend, authenticated with the current
 *  session's bearer token (never a stale one — see module doc above). */
export function getApiClient(): PaketApiClient {
  return createApiClient({
    baseUrl: apiBaseUrl,
    token: getSession()?.token,
  });
}
