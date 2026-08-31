/**
 * Kolleg:innen-Liste fürs Einladen (Beleg-Zusammenarbeit 31.08.2026):
 * `GET /api/me/colleagues` — aktive Mitarbeitende ohne den Aufrufer, vom
 * Backend sortiert (heute im Dienst zuerst, dann Name). Die UI sortiert nicht
 * nach — wer „im Dienst" ist, entscheidet der Server (ClockService).
 */
import { useQuery } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export type ColleagueDto = components['schemas']['ColleagueDto'];

export function useColleagues() {
  return useQuery({
    queryKey: ['me', 'colleagues'],
    queryFn: async () => handleApiResponse(await getApiClient().GET('/api/me/colleagues')),
  });
}
