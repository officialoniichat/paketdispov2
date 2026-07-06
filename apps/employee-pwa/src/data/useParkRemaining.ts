/**
 * `POST /api/me/park` — B4 Parkposition: park the remaining, unbegonnene
 * Belege of the caller's own bundle back into the pool. On success the
 * `['me', 'today']` query is invalidated so the shrunken bundle shows up
 * without a manual refetch.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export interface ParkRemainingInput {
  /** Zu parkende Belege (müssen assigned + im eigenen Bündel sein). */
  caseIds: string[];
}

export function useParkRemaining() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ParkRemainingInput) => {
      const response = await getApiClient().POST('/api/me/park', { body: input });
      return handleApiResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    },
  });
}
