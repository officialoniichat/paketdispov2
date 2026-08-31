/**
 * `/api/me/cases/{caseId}/aggregate` — everything needed to work one Beleg
 * (case + work instruction + positions + box targets). Replaces the old
 * `useLiveQuery(() => db.caseAggregates.get(caseId))` read.
 *
 * Seit der Beleg-Zusammenarbeit (31.08.2026) ist dieses Aggregat auch die
 * Wahrheit über „Position geprüft", Ist-Mengen und Preiskorrekturen: die
 * Aktions-Hooks (`useConfirmPosition`, `useCountSku`) patchen genau diesen Cache
 * optimistisch, der Live-Kanal invalidiert ihn gezielt. Deshalb liegt der
 * Query-Key hier — eine Stelle, kein wiederholtes Array-Literal.
 */
import { useQuery } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export type CaseAggregateDto = components['schemas']['CaseAggregateDto'];

/** Query-Key des Beleg-Aggregats — von Hooks, Live-Kanal und Flow geteilt. */
export function caseAggregateKey(caseId: string): readonly [string, string, string, string] {
  return ['me', 'case', caseId, 'aggregate'] as const;
}

export function useCaseAggregate(caseId: string) {
  return useQuery({
    queryKey: caseAggregateKey(caseId),
    queryFn: async () => {
      const response = await getApiClient().GET('/api/me/cases/{caseId}/aggregate', {
        params: { path: { caseId } },
      });
      return handleApiResponse(response);
    },
  });
}
