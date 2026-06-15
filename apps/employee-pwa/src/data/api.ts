/**
 * Live backend client for the Mitarbeiter-App.
 *
 * Wraps the typed @paket/api-client with the dev bearer token and base URL from
 * Vite env. When VITE_API_BASE_URL is unset the app runs in offline-demo mode
 * (see App.tsx) and this client is never called.
 */
import { createApiClient, type PaketApiClient } from '@paket/api-client';

/** Backend base URL; undefined toggles offline-demo mode. */
export const apiBaseUrl: string | undefined = import.meta.env.VITE_API_BASE_URL;

/** Dev bearer token (RS256). Minted out-of-band, see .env.example. */
export const devToken: string | undefined = import.meta.env.VITE_DEV_TOKEN;

/** True when a backend is configured and the app should load live work. */
export const isBackendEnabled = Boolean(apiBaseUrl);

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
