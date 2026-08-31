/**
 * Live-update subscription against `GET /api/me/stream` (§12.3 SSE). Browser
 * `EventSource` cannot set a custom `Authorization` header, so the token is
 * passed as a `?token=` query param — the backend's `JwtAuthGuard` accepts
 * this fallback only for the SSE routes and only when no Authorization
 * header is present (see `apps/backend-api/src/auth/guards.ts`).
 *
 * Der Kanal ist typisiert (`liveEventSchema`, Konzept beleg-zusammenarbeit §8): der
 * Server sendet jedes Ereignis als BENANNTES SSE-Event (`event: <type>`), deshalb
 * wird je Typ aus `liveEventTypeSchema.options` ein `addEventListener` registriert —
 * `onmessage` empfängt ausschließlich unbenannte Events und hätte nie etwas gesehen.
 *
 * Invalidiert wird GEZIELT je Ereignistyp, nicht mehr pauschal (31.08.2026):
 *
 * | Ereignis | Wirkung |
 * |---|---|
 * | `case.status` | Übersicht + Beleg-Ansicht (Status hat sich geändert) |
 * | `position.confirmed`, `sku.counted` | Aggregat GENAU dieses Belegs + Übersicht (`k/n geprüft`) + Aufleuchten des Handelnden |
 * | `collaboration.invited`, `collaboration.changed` | Übersicht + Beleg-Ansicht + Posteingang/Badge |
 *
 * Der Stream ist serverseitig auf die Empfängerliste gefiltert (§16.1), es kommt
 * also ohnehin nur an, was mich betrifft. Die eigene Aktion kommt ebenfalls
 * zurück — sie invalidiert dann nur den Cache, den sie schon optimistisch trägt.
 */
import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { liveEventSchema, liveEventTypeSchema, type LiveEventType } from '@paket/domain-types';
import { apiBaseUrl } from './api.js';
import { getSession } from './session.js';
import { caseAggregateKey } from './useCaseAggregate.js';
import { markGlow } from './useTeamGlow.js';

const TODAY_KEY = ['me', 'today'] as const;
const CASE_KEY = ['me', 'case'] as const;
const NACHRICHTEN_KEY = ['me', 'nachrichten'] as const;

/** Nutzlast eines Live-Ereignisses, soweit lesbar — sonst leer (Anzeige-Kanal). */
interface LiveEventPayload {
  caseId: string | null;
  actorEmployeeNo: string | null;
}

const EMPTY_PAYLOAD: LiveEventPayload = { caseId: null, actorEmployeeNo: null };

/**
 * Der Ereignis-TYP steht schon am Listener (benanntes SSE-Event) — aus der
 * Nutzlast brauchen wir nur Beleg und Handelnden. Ein unlesbarer Body darf die
 * Aktualisierung nicht verhindern: dann wird eben gröber invalidiert.
 */
function readPayload(event: MessageEvent): LiveEventPayload {
  const raw: unknown = (event as { data?: unknown }).data;
  if (typeof raw !== 'string') return EMPTY_PAYLOAD;
  try {
    const parsed = liveEventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return EMPTY_PAYLOAD;
    return { caseId: parsed.data.caseId, actorEmployeeNo: parsed.data.actorEmployeeNo };
  } catch {
    return EMPTY_PAYLOAD;
  }
}

/** Invalidiert genau das, was dieser Ereignistyp verändert haben kann. */
export function applyLiveEvent(
  queryClient: QueryClient,
  type: LiveEventType,
  payload: LiveEventPayload,
): void {
  const caseKey = payload.caseId === null ? CASE_KEY : caseAggregateKey(payload.caseId);
  switch (type) {
    case 'case.status':
      void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
      void queryClient.invalidateQueries({ queryKey: CASE_KEY });
      return;
    case 'position.confirmed':
    case 'sku.counted':
      void queryClient.invalidateQueries({ queryKey: caseKey });
      void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
      if (payload.caseId !== null && payload.actorEmployeeNo !== null) {
        markGlow(queryClient, payload.caseId, payload.actorEmployeeNo);
      }
      return;
    case 'collaboration.invited':
    case 'collaboration.changed':
      void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
      void queryClient.invalidateQueries({ queryKey: CASE_KEY });
      void queryClient.invalidateQueries({ queryKey: NACHRICHTEN_KEY });
      return;
  }
}

export function useLiveUpdates(): void {
  const queryClient = useQueryClient();
  const token = getSession()?.token;

  useEffect(() => {
    if (!token) return undefined;

    const source = new EventSource(
      `${apiBaseUrl}/api/me/stream?token=${encodeURIComponent(token)}`,
    );
    for (const type of liveEventTypeSchema.options) {
      source.addEventListener(type, (event) =>
        applyLiveEvent(queryClient, type, readPayload(event as MessageEvent)),
      );
    }
    return () => source.close();
    // Re-open the connection whenever the session token changes (fresh login
    // after a logout mints a new token the old EventSource wasn't authorized
    // with), not just on mount.
  }, [queryClient, token]);
}
