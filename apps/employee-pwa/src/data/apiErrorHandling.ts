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

/** Rückfall, wenn der Fehler-Body keine lesbare Meldung trägt. */
const GENERIC_MESSAGE = 'Die Anfrage an den Server ist fehlgeschlagen.';

/**
 * Der deutsche Klartext einer abgelehnten Anfrage. Das Backend antwortet als
 * einzige Fachlogik-Instanz mit fertigen deutschen Sätzen (409 „Der Beleg ist
 * nicht in Bearbeitung.", 400 „Noch n Positionen ungeprüft – …"); die
 * Bildschirme zeigen sie unverändert, statt sie hinter einem generischen Satz zu
 * verstecken (Beleg-Zusammenarbeit 31.08.2026). Nest sendet `message` als String
 * oder — bei Validierungsfehlern — als Liste.
 */
export function apiErrorMessage(error: unknown): string {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message?: unknown }).message
      : undefined;
  const message = Array.isArray(raw) ? raw.join(' · ') : raw;
  return typeof message === 'string' && message.length > 0 ? message : GENERIC_MESSAGE;
}

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
    throw new Error(apiErrorMessage(result.error));
  }
  return result.data as T;
}
