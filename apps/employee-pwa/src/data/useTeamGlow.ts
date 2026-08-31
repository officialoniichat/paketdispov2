/**
 * Aufleuchten der Kästchen in der „Team-Ansicht" (Beleg-Zusammenarbeit
 * 31.08.2026, Konzept §3.6): hakt ein anderer Beteiligter eine Position ab oder
 * ändert eine Menge, leuchtet SEIN Kästchen bei allen anderen kurz auf — so
 * sieht man, wo gerade gearbeitet wird, ohne nachzufragen.
 *
 * Der Zustand ist reine Anzeige und lebt deshalb im Query-Cache unter
 * `['local','glow',<caseId>]` (Muster: der lokale Fortschritt in `useCaseFlow`):
 * `useLiveUpdates` schreibt beim Eintreffen eines Ereignisses, `useTeamGlow`
 * liest. Der Zeitstempel ist bewusst die LOKALE Empfangszeit — die Uhr des
 * Tablets und die des Servers gehen selten exakt gleich, das Aufleuchten soll
 * aber ab dem Eintreffen genau 1,5 s dauern.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

/** Dauer des Aufleuchtens (~1,5 s laut Konzept) — auch die Animationsdauer. */
export const GLOW_DURATION_MS = 1500;

/** employeeNo → lokale Empfangszeit der letzten Aktion (ms seit Epoch). */
export type GlowMap = Readonly<Record<string, number>>;

const EMPTY_GLOW: GlowMap = {};

export function glowQueryKey(caseId: string): readonly [string, string, string] {
  return ['local', 'glow', caseId] as const;
}

/** Merkt die Aktion eines Beteiligten — sein Kästchen leuchtet ab jetzt kurz auf. */
export function markGlow(queryClient: QueryClient, caseId: string, employeeNo: string): void {
  queryClient.setQueryData<GlowMap>(glowQueryKey(caseId), (old) => ({
    ...(old ?? EMPTY_GLOW),
    [employeeNo]: Date.now(),
  }));
}

/**
 * Die employeeNos, deren Kästchen GERADE leuchten sollen. Der Hook plant selbst
 * einen Timer auf das Ende des jüngsten Aufleuchtens, damit das Licht wieder
 * ausgeht, ohne dass ein weiteres Ereignis eintrifft.
 */
export function useTeamGlow(caseId: string): ReadonlySet<string> {
  const queryClient = useQueryClient();
  const { data } = useQuery<GlowMap>({
    queryKey: glowQueryKey(caseId),
    queryFn: () => queryClient.getQueryData<GlowMap>(glowQueryKey(caseId)) ?? EMPTY_GLOW,
    staleTime: Infinity,
  });
  const glow = data ?? EMPTY_GLOW;
  // Erzwingt das Neuberechnen, wenn ein Aufleuchten ausläuft (kein neues Ereignis).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const nextEnd = Object.values(glow)
      .map((startedAt) => startedAt + GLOW_DURATION_MS)
      .filter((end) => end > now)
      .sort((a, b) => a - b)[0];
    if (nextEnd === undefined) return undefined;
    const timer = setTimeout(() => setTick((t) => t + 1), nextEnd - now);
    return () => clearTimeout(timer);
  }, [glow, tick]);

  return useMemo(() => {
    const now = Date.now();
    return new Set(
      Object.entries(glow)
        .filter(([, startedAt]) => now - startedAt < GLOW_DURATION_MS)
        .map(([employeeNo]) => employeeNo),
    );
    // `tick` ist Absicht: er ist der Auslöser für das Neuberechnen nach Ablauf.
  }, [glow, tick]);
}
