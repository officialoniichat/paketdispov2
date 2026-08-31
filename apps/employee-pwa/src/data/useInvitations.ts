/**
 * Einladungen zum geteilten Beleg (Beleg-Zusammenarbeit 31.08.2026).
 *
 * - `useEinladen`: `POST /api/me/cases/:caseId/invitations` — einladen darf der
 *   Inhaber und jeder aktive Beteiligte; die Regeln (Beleg-Status, Re-Invite
 *   nach abgelehnt/entfernt) prüft das Backend.
 * - `useEinladungAntworten`: `POST /api/me/invitations/:participantId/respond` —
 *   grüner Haken (annehmen) bzw. rotes Kreuz (ablehnen), nur der Eingeladene.
 *
 * Beide invalidieren `['me','nachrichten']` (Posteingang/Badge) und
 * `['me','today']` (Karten-Markierung „geteilt" bzw. Abschnitt „Geteilt mit dir").
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export interface EinladenInput {
  caseId: string;
  employeeNos: string[];
  /** Optionale Nachricht an die Eingeladenen (max. 500 Zeichen, Backend-validiert). */
  message?: string;
}

export function useEinladen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, employeeNos, message }: EinladenInput) => {
      const response = await getApiClient().POST('/api/me/cases/{caseId}/invitations', {
        params: { path: { caseId } },
        // Leere Nachricht gar nicht erst mitschicken (ValidationPipe whitelist).
        body: message !== undefined && message !== '' ? { employeeNos, message } : { employeeNos },
      });
      return handleApiResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'nachrichten'] });
    },
  });
}

export interface EinladungAntwortInput {
  /** Beteiligungs-Zeile (CaseParticipant) der Einladung. */
  participantId: string;
  /** true = grüner Haken (annehmen), false = rotes Kreuz (ablehnen). */
  accept: boolean;
}

export function useEinladungAntworten() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ participantId, accept }: EinladungAntwortInput) => {
      const response = await getApiClient().POST('/api/me/invitations/{participantId}/respond', {
        params: { path: { participantId } },
        body: { accept },
      });
      return handleApiResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'nachrichten'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    },
  });
}
