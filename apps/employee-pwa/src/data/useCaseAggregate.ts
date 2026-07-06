/**
 * `/api/me/cases/{caseId}/aggregate` — everything needed to work one Beleg
 * (case + work instruction + positions + box targets). Replaces the old
 * `useLiveQuery(() => db.caseAggregates.get(caseId))` read.
 */
import { useQuery } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export function useCaseAggregate(caseId: string) {
  return useQuery({
    queryKey: ['me', 'case', caseId, 'aggregate'],
    queryFn: async () => {
      const response = await getApiClient().GET('/api/me/cases/{caseId}/aggregate', {
        params: { path: { caseId } },
      });
      return handleApiResponse(response);
    },
  });
}
