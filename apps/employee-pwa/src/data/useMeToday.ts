/**
 * `/api/me/today` — the day's assignment (bundle + case list + claimed
 * workstation). Replaces the old `useLiveQuery(() => db.today.get('today'))`
 * reads: the backend is now the single source of truth, React Query is the
 * client-side cache.
 */
import { useQuery } from '@tanstack/react-query';
import { localDayIso } from '../domain/catMan.js';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export function useMeToday() {
  return useQuery({
    queryKey: ['me', 'today'],
    queryFn: async () => {
      const response = await getApiClient().GET('/api/me/today');
      return handleApiResponse(response);
    },
  });
}

/**
 * Der Bezugstag für Termin-Vergleiche (aktuell: „CatMan-Termin überfällig?").
 * Maßgeblich ist der SERVER-Tag aus `/api/me/today` — dieselbe Wahrheit, nach
 * der das Backend das Tagesbündel schneidet; damit rechnen alle Screens gegen
 * denselben Tag. Nur solange er nicht geladen ist (erster Aufruf, offline),
 * fällt die Anzeige auf den Gerätetag zurück, statt leer zu bleiben.
 *
 * Teilt sich den Query-Key mit `useMeToday()` — der Aufruf kostet keinen
 * zusätzlichen Request, React Query liefert denselben Cache-Eintrag.
 */
export function useReferenceDay(): string {
  const { data } = useMeToday();
  return data?.date ?? localDayIso();
}
