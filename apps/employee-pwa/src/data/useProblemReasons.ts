/**
 * `/api/problem-reasons` — der admin-verwaltete Problemarten-Katalog
 * (Kundenfeedback 14.07.2026). Die Mitarbeiter-App lädt nur die AKTIVEN Gründe
 * dynamisch; kein hartkodiertes Enum mehr. Der Katalog ändert sich selten, daher
 * eine großzügige staleTime.
 */
import { useQuery } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export type ProblemReasonDto = components['schemas']['ProblemReasonDto'];

export function useProblemReasons() {
  return useQuery({
    queryKey: ['problem-reasons'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProblemReasonDto[]> => {
      const response = await getApiClient().GET('/api/problem-reasons');
      return handleApiResponse(response);
    },
  });
}
