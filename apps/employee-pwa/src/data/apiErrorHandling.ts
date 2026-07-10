/**
 * Shared 401 interceptor for `@paket/api-client` (openapi-fetch) calls.
 *
 * openapi-fetch resolves every request to `{ data, error, response }`
 * (`response` is the raw `Response`). Any call site that wraps its result with
 * `handleApiResponse` gets uniform session-expiry handling: a 401 clears the
 * session (see `data/session.ts`) and throws a `SessionExpiredError`, which
 * bubbles up to the React Query cache's global `onError`
 * (`data/queryClient.ts`) — `App.tsx` subscribes to `onSessionCleared` and
 * forces the router back to `LoginScreen` regardless of which layer triggered
 * the clear (401 here, or an explicit `logout()` from `data/auth.ts`).
 */
import { clearSession } from './session.js';

export class SessionExpiredError extends Error {}

interface ApiResult<T> {
  response: Response;
  data?: T;
  error?: unknown;
}

export function handleApiResponse<T>(result: ApiResult<T>): T {
  if (result.response.status === 401) {
    clearSession();
    throw new SessionExpiredError('Sitzung abgelaufen');
  }
  if (result.error) {
    throw new Error('Die Anfrage an den Server ist fehlgeschlagen.');
  }
  return result.data as T;
}
