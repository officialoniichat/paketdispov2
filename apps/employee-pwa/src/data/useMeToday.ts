/**
 * `/api/me/today` — the day's assignment (bundle + case list + claimed
 * workstation). Replaces the old `useLiveQuery(() => db.today.get('today'))`
 * reads: the backend is now the single source of truth, React Query is the
 * client-side cache.
 */
import { useQuery } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export function useMeToday() {
  return useQuery({
    queryKey: ['me', 'today'],
    queryFn: async () => {
      const response = await getApiClient().GET('/api/me/today');
      return handleApiResponse(response);
    },
  });
}
