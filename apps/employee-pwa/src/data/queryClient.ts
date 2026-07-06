/**
 * App-wide React Query client (mounted in `main.tsx`).
 *
 * `QueryClient` construction happens outside the React tree, so it cannot
 * call a `useState` setter directly. Instead its cache-level `onError` hooks
 * just react to a `SessionExpiredError` (thrown by `data/apiErrorHandling.ts`
 * on any 401) by calling `clearSession()` — which is the single source of
 * truth for "session ended" and already notifies subscribers via
 * `onSessionCleared` (see `data/session.ts`). `App.tsx` is the subscriber that
 * forces the router back to `LoginScreen`. `clearSession()` is idempotent, so
 * this is a no-op safety net when `handleApiResponse` already cleared it.
 */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { SessionExpiredError } from './apiErrorHandling.js';
import { clearSession } from './session.js';

function handlePossibleSessionExpiry(error: unknown): void {
  if (error instanceof SessionExpiredError) {
    clearSession();
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handlePossibleSessionExpiry }),
  mutationCache: new MutationCache({ onError: handlePossibleSessionExpiry }),
});
