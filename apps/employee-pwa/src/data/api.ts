/**
 * Live backend client for the Mitarbeiter-App.
 *
 * Wraps the typed @paket/api-client with the dev bearer token and base URL from
 * Vite env. When VITE_API_BASE_URL is unset the app runs in offline-demo mode
 * (see App.tsx) and this client is never called.
 */
import { createApiClient, type PaketApiClient } from '@paket/api-client';
import { resolveEnv } from '../config/runtimeEnv.js';

// resolveEnv reads the runtime value (window.__ENV__ from /env.js) first, then the
// build-time import.meta.env. On Railway this lets the deployed app point at the
// real backend without a rebuild. See src/config/runtimeEnv.ts.

/** Backend base URL; undefined toggles offline-demo mode. Trailing slash stripped so
 *  openapi-fetch never builds a double-slash URL that 404s on Fastify. */
export const apiBaseUrl: string | undefined = resolveEnv('VITE_API_BASE_URL')?.replace(/\/+$/, '');

/** Dev bearer token (RS256). Minted out-of-band, see .env.example. */
export const devToken: string | undefined = resolveEnv('VITE_DEV_TOKEN');

/** True when a backend is configured and the app should load live work. */
export const isBackendEnabled = Boolean(apiBaseUrl);

/**
 * Explicit dev flag for the demo/scenario picker (A1). Employees must never see
 * it — it renders ONLY when VITE_DEMO_CONTROLS=1 (e2e/dev builds), never by the
 * mere absence of a backend URL.
 */
export const demoControlsEnabled = resolveEnv('VITE_DEMO_CONTROLS') === '1';

let client: PaketApiClient | undefined;

/** Singleton typed client against the configured backend. */
export function getApiClient(): PaketApiClient {
  if (!client) {
    client = createApiClient({
      baseUrl: apiBaseUrl ?? 'http://localhost:3000',
      token: devToken,
    });
  }
  return client;
}
