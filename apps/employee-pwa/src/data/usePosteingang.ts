/**
 * Posteingang der Beleg-Zusammenarbeit (31.08.2026): `GET /api/me/nachrichten`
 * liefert Einladungen (erhalten UND gesendet, alle Status) plus die
 * Teamlead-Nachrichten, neueste zuerst. `pendingCount` (offene Einladungen an
 * mich + ungelesene Teamlead-Nachrichten) ist die Zahl am Profilkreis.
 *
 * Polling 15 s wie die übrigen Mitarbeiter-Nachrichten (offline-freundlich);
 * SSE beschleunigt später nur (`useLiveUpdates` invalidiert `['me','nachrichten']`
 * als Präfix — dieser Key hängt bewusst darunter).
 */
import { useQuery } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export type NachrichtDto = components['schemas']['NachrichtDto'];
export type PosteingangDto = components['schemas']['PosteingangDto'];

export function usePosteingang() {
  return useQuery({
    queryKey: ['me', 'nachrichten', 'posteingang'],
    queryFn: async () => handleApiResponse(await getApiClient().GET('/api/me/nachrichten')),
    refetchInterval: 15_000,
  });
}

/**
 * Die älteste noch offene Einladung an mich — genau die zeigt das
 * `EinladungOverlay`, bis der Mitarbeiter reagiert; danach rückt die nächste
 * nach (Konzept §3.2: kein Auto-Dismiss). `items` kommen vom Backend neueste
 * zuerst, deshalb das LETZTE offene Element.
 */
export function aeltesteOffeneEinladung(items: readonly NachrichtDto[]): NachrichtDto | undefined {
  return items
    .filter(
      (n) =>
        n.kind === 'einladung_erhalten' &&
        n.status === 'offen' &&
        typeof n.participantId === 'string',
    )
    .at(-1);
}
