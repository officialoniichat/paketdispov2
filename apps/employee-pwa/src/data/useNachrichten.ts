/**
 * Teamlead-Nachrichten in der Mitarbeiter-App: `/api/me/messages` liefert die
 * UNGELESENEN Nachrichten (Banner), `/api/me/messages/:id/read` quittiert —
 * die Quittung sieht der Teamlead in seinem Sidebar-Ausklapper. Polling statt
 * Push (offline-freundlich, wie useFocusRefresh).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export function useUngeleseneNachrichten() {
  return useQuery({
    queryKey: ['me', 'nachrichten'],
    queryFn: async () => handleApiResponse(await getApiClient().GET('/api/me/messages')),
    refetchInterval: 15_000,
  });
}

export function useNachrichtGelesen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      handleApiResponse(
        await getApiClient().POST('/api/me/messages/{id}/read', {
          params: { path: { id } },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['me', 'nachrichten'] }),
  });
}
