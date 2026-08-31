/**
 * Live-Aktualisierung des Cockpits (Konzept beleg-zusammenarbeit §8, 31.08.2026):
 * der erste SSE-Consumer des Cockpits gegen `GET /api/teamlead/stream`. Der
 * Teamlead-Stream erhält JEDES Ereignis ungefiltert (der `recipients`-Filter gilt
 * nur für `/api/me/stream`), deshalb genügt hier ein Signal „etwas hat sich
 * geändert": Ereignisse werden {@link COCKPIT_LIVE_DEBOUNCE_MS} lang gebündelt
 * und invalidieren dann dieselben drei Query-Familien wie die Mutationen —
 * `['cockpit']`, `['beleg']`, `['belege']`.
 *
 * Browser-`EventSource` kann keinen Authorization-Header setzen; der Token wandert
 * wie in der PWA als `?token=`-Query-Param (der Backend-Guard akzeptiert das nur
 * für die SSE-Routen). Token-Quelle wie in {@link ./api}: `VITE_DEV_TOKEN` über
 * `resolveEnv`. Ohne Token — oder ohne `EventSource`, etwa in jsdom-Tests — tut
 * der Hook nichts; staleTime/Refetch bleiben der Fallback. Verbindungsabbrüche
 * verbindet `EventSource` selbst neu.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { liveEventTypeSchema } from '@paket/domain-types';
import { apiBaseUrl } from './api.js';
import { resolveEnv } from '../config/runtimeEnv.js';

/** Bündel-Fenster: viele Live-Ereignisse → EINE Auffrischung. */
export const COCKPIT_LIVE_DEBOUNCE_MS = 500;

export function useCockpitLive(): void {
  const queryClient = useQueryClient();
  const token = resolveEnv('VITE_DEV_TOKEN');

  useEffect(() => {
    if (!token || typeof EventSource === 'undefined') return undefined;

    const source = new EventSource(
      `${apiBaseUrl}/api/teamlead/stream?token=${encodeURIComponent(token)}`,
    );
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = (): void => {
      timer = null;
      void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
      void queryClient.invalidateQueries({ queryKey: ['beleg'] });
      void queryClient.invalidateQueries({ queryKey: ['belege'] });
    };
    const schedule = (): void => {
      if (timer === null) timer = setTimeout(flush, COCKPIT_LIVE_DEBOUNCE_MS);
    };
    // Der Server sendet BENANNTE SSE-Events (`event: <type>`) — nur
    // `addEventListener` je Typ empfängt sie, `onmessage` nie.
    for (const type of liveEventTypeSchema.options) {
      source.addEventListener(type, schedule);
    }
    return () => {
      if (timer !== null) clearTimeout(timer);
      source.close();
    };
  }, [queryClient, token]);
}
