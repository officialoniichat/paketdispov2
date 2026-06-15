/**
 * TanStack Query client for the teamlead cockpit.
 *
 * Short stale window (cockpit is near-real-time), focus refetch off (dispatcher
 * keeps the tab open all shift), mutations don't auto-retry (overrides/recalc
 * are explicit, audited actions).
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: { retry: 0 },
  },
});
