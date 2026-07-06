/**
 * Live-update subscription against `GET /api/me/stream` (§12.3 SSE). Browser
 * `EventSource` cannot set a custom `Authorization` header, so the token is
 * passed as a `?token=` query param — the backend's `JwtAuthGuard` accepts
 * this fallback only for the SSE routes and only when no Authorization
 * header is present (see `apps/backend-api/src/auth/guards.ts`).
 *
 * The stream is server-scoped to the caller's own `employeeNo` (§16.1), so
 * any event received here is safe to treat as "something about my day
 * changed" — we just invalidate `['me', 'today']` and let `useMeToday()`
 * refetch.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiBaseUrl } from './api.js';
import { getSession } from './session.js';

export function useLiveUpdates(): void {
  const queryClient = useQueryClient();
  const token = getSession()?.token;

  useEffect(() => {
    if (!token) return undefined;

    const source = new EventSource(`${apiBaseUrl}/api/me/stream?token=${encodeURIComponent(token)}`);
    source.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    };
    return () => source.close();
    // Re-open the connection whenever the session token changes (fresh login
    // after a logout mints a new token the old EventSource wasn't authorized
    // with), not just on mount.
  }, [queryClient, token]);
}
