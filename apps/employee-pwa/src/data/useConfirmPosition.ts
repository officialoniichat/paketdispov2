/**
 * `POST /api/cases/:caseId/positions/:positionId/confirmed` — der Haken
 * „Position geprüft" (Beleg-Zusammenarbeit 31.08.2026, Konzept §2/§7).
 *
 * Er ist seit der Zusammenarbeit SERVERSEITIG: mehrere Beteiligte brauchen einen
 * gemeinsamen Stand, und er überlebt jetzt auch das Neuladen. Muster wie
 * `useSetCollected`: optimistischer Patch des Aggregat-Caches (der Haken reagiert
 * sofort — Lager-WLAN!), Rollback bei Fehler, `onSettled` holt die
 * Server-Wahrheit nach. Den Beleg-Status (in_progress) und die Zugriffsregeln
 * prüft das Backend; ein Fehlertext von dort wird unverändert durchgereicht.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';
import { caseAggregateKey, type CaseAggregateDto } from './useCaseAggregate.js';
import { getSession } from './session.js';

export interface ConfirmPositionInput {
  caseId: string;
  positionId: string;
  /** true = Haken setzen, false = Haken zurücknehmen (D5: rücknehmbar). */
  confirmed: boolean;
}

export function useConfirmPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, positionId, confirmed }: ConfirmPositionInput) => {
      const response = await getApiClient().POST(
        '/api/cases/{caseId}/positions/{positionId}/confirmed',
        { params: { path: { caseId, positionId } }, body: { confirmed } },
      );
      return handleApiResponse(response);
    },
    onMutate: async ({ caseId, positionId, confirmed }) => {
      const key = caseAggregateKey(caseId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CaseAggregateDto>(key);
      // Prüfer bin bis zur Server-Antwort ICH — genau das zeigen die Initialen
      // an der Position (und beim Zurücknehmen niemand).
      const session = getSession();
      const confirmedBy =
        confirmed && session
          ? { employeeNo: session.employeeNo, displayName: session.displayName }
          : null;
      queryClient.setQueryData<CaseAggregateDto>(key, (old) =>
        old
          ? {
              ...old,
              positions: old.positions.map((pos) =>
                pos.id === positionId
                  ? {
                      ...pos,
                      confirmedBy,
                      confirmedAt: confirmed ? new Date().toISOString() : null,
                    }
                  : pos,
              ),
            }
          : old,
      );
      return { previous, key };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _error, { caseId }) => {
      void queryClient.invalidateQueries({ queryKey: caseAggregateKey(caseId) });
      // Die Karte unter „2 · Bearbeiten" zeigt „k/n geprüft" — mitziehen.
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    },
  });
}
