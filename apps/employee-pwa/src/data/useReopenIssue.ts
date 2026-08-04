/**
 * `/api/me/cases/{caseId}/issues/{issueId}/reopen` — Rückmeldung des MA auf
 * eine TL-Instruktion (Instruktions-Loop 04.08.2026). Die Meldung geht zurück
 * auf „offen", der Beleg zurück in den Problem-Status; Statusableitung trifft
 * ausschließlich das Backend. Invalidert Beleg-Aggregate + Tagesbündel, damit
 * Sperr-Banner und Badge sofort nachziehen.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export function useReopenIssue(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, text }: { issueId: string; text: string }) => {
      const response = await getApiClient().POST(
        '/api/me/cases/{caseId}/issues/{issueId}/reopen',
        {
          params: { path: { caseId, issueId } },
          body: { text },
        },
      );
      return handleApiResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'case', caseId, 'aggregate'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    },
  });
}
