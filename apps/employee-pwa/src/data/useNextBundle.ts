/**
 * `POST /api/me/next-bundle` — the worker requests the next cart-sized bundle
 * (Pull-on-idle). On success the `['me', 'today']` query is invalidated so the
 * newly assigned bundle shows up without a manual refetch.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export function useRequestNextBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await getApiClient().POST('/api/me/next-bundle');
      return handleApiResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    },
  });
}
