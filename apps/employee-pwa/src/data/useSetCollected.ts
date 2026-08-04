/**
 * `POST /api/cases/:caseId/collected` — Ware-holen-Haken (B2): persistiert den
 * Abhak-Zustand eines Beleg-Containers am Case selbst (überlebt Reload,
 * Navigation und Gerätewechsel). Tipp in der Liste und Scanner-Auto-Abhaken
 * laufen beide über diese eine Mutation.
 *
 * Optimistisch: der Haken reagiert sofort (Lager-WLAN!), der `['me','today']`-
 * Cache wird direkt gepatcht und bei Fehler zurückgerollt; onSettled holt die
 * Server-Wahrheit nach.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

type TodayResponse = components['schemas']['TodayResponseDto'];

export interface SetCollectedInput {
  caseId: string;
  /** true = geholt, false = Haken wieder entfernt (Toggle). */
  collected: boolean;
}

export function useSetCollected() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, collected }: SetCollectedInput) => {
      const response = await getApiClient().POST('/api/cases/{caseId}/collected', {
        params: { path: { caseId } },
        body: { collected },
      });
      return handleApiResponse(response);
    },
    onMutate: async ({ caseId, collected }) => {
      await queryClient.cancelQueries({ queryKey: ['me', 'today'] });
      const previous = queryClient.getQueryData<TodayResponse>(['me', 'today']);
      queryClient.setQueryData<TodayResponse>(['me', 'today'], (old) =>
        old
          ? { ...old, cases: old.cases.map((c) => (c.id === caseId ? { ...c, collected } : c)) }
          : old,
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['me', 'today'], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    },
  });
}
