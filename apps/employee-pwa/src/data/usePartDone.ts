/**
 * `POST /api/me/cases/:caseId/part-done` — „Teilbeleg erledigt"
 * (Beleg-Zusammenarbeit 31.08.2026, Konzept §3.7).
 *
 * Meldet die EIGENE Beteiligung als erledigt (`angenommen` → `teil_erledigt`).
 * Am Beleg ändert sich nichts: er ist erst fertig, wenn alle Positionen geprüft
 * sind. Bei den anderen erscheint man ab jetzt grau, mithelfen bleibt erlaubt,
 * und gebucht wird dabei nichts (die ZST-Buchung kommt erst beim Abschluss).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';
import { caseAggregateKey } from './useCaseAggregate.js';

export interface PartDoneInput {
  caseId: string;
}

export function usePartDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId }: PartDoneInput) => {
      const response = await getApiClient().POST('/api/me/cases/{caseId}/part-done', {
        params: { path: { caseId } },
      });
      return handleApiResponse(response);
    },
    onSuccess: (_data, { caseId }) => {
      void queryClient.invalidateQueries({ queryKey: caseAggregateKey(caseId) });
      // Das eigene Pack darf jetzt weitergehen (§3.8) — Übersicht neu laden.
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    },
  });
}
