/**
 * Server persistence of case transitions for the Mitarbeiter-App.
 *
 * Every `persist*` function here IS the write — there is no more local Dexie
 * write happening first (that db is gone, see task-10/task-13). Each POSTs the
 * matching backend transition (§7.1 state machine) and returns the server's
 * authoritative `TransitionResultDto` (case id, new status, version). A failed
 * request throws: callers (see `workflow/useCaseFlow.ts`) must handle it
 * explicitly — nothing here swallows an error.
 *
 * Probleme werden NICHT mehr einzeln gemeldet: sie werden während der
 * Bearbeitung lokal gesammelt und beim Teilabschluss gebündelt übertragen
 * (Kundenfeedback 14.07.2026). Der beleg-weite Problem-Melden-Endpoint ist weg.
 */
import type { components } from '@paket/api-client';
import { getApiClient } from './api.js';

export type TransitionResultDto = components['schemas']['TransitionResultDto'];
type SkuQuantityDto = components['schemas']['SkuQuantityDto'];
type ReportedProblemDto = components['schemas']['ReportedProblemDto'];

interface ApiResult<T> {
  data?: T;
  error?: unknown;
}

/**
 * Verständliche deutsche Meldung für einen abgelehnten Übergangs-POST — statt
 * eines rohen JSON-Dumps des Fehler-Bodys. Die häufigste Ablehnung ist die
 * State-Machine des Backends („Illegal case transition: completed →
 * in_progress"), wenn ein bereits fertiger Beleg erneut gestartet würde; die
 * übrigen Backend-Meldungen (BadRequest) sind bereits deutsch und werden
 * durchgereicht. Ohne lesbaren Body bleibt der generische Retry-Hinweis.
 */
export function transitionErrorMessage(label: string, error: unknown): string {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message?: unknown }).message
      : undefined;
  const message = Array.isArray(raw) ? raw.join(' · ') : raw;
  if (typeof message === 'string' && message.length > 0) {
    const illegal = /^Illegal case transition: (\S+) → \S+$/.exec(message);
    if (illegal) {
      const from = illegal[1];
      if (from === 'completed' || from === 'zst_done') {
        return `${label} nicht möglich – der Beleg ist bereits abgeschlossen.`;
      }
      return `${label} nicht möglich – der Beleg wurde zwischenzeitlich geändert (Status „${from}").`;
    }
    return `${label} fehlgeschlagen: ${message}`;
  }
  return `${label} fehlgeschlagen – bitte erneut versuchen.`;
}

/** Unwrap an openapi-fetch result, throwing on any non-2xx/error response. */
function unwrap(label: string, result: ApiResult<TransitionResultDto>): TransitionResultDto {
  if (result.error || !result.data) {
    throw new Error(transitionErrorMessage(label, result.error));
  }
  return result.data;
}

/** POST /api/cases/:id/start-preparation → assigned/problem_resolved → in_progress. */
export async function persistStartPreparation(caseId: string): Promise<TransitionResultDto> {
  return unwrap(
    'Start',
    await getApiClient().POST('/api/cases/{caseId}/start-preparation', {
      params: { path: { caseId } },
    }),
  );
}

/**
 * POST /api/cases/:id/complete → „Beleg erledigt", writes the ZstRecord.
 *
 * `skuQuantities` are the employee's counted Ist-Mengen (incl. corrected VK).
 * The backend REJECTS the call when any deviation, price correction or manual
 * problem exists — those force a Teilabschluss (Kundenfeedback 14.07.2026).
 */
export async function persistComplete(
  caseId: string,
  skuQuantities: SkuQuantityDto[],
): Promise<TransitionResultDto> {
  return unwrap(
    'Abschluss',
    await getApiClient().POST('/api/cases/{caseId}/complete', {
      params: { path: { caseId } },
      body: { skuQuantities },
    }),
  );
}

/**
 * POST /api/cases/:id/partial-complete → Teilabschluss mit gesammelten Problemen.
 *
 * Schickt alle gezählten Ist-Mengen (inkl. Preiskorrektur) plus die manuell
 * erfassten Positions-Probleme. Das Backend leitet die impliziten Probleme
 * (Mehr-/Minderlieferung, Preisabweichung) selbst ab und parkt den Beleg rot
 * beim selben MA (issue_open), bis der Teamlead klärt.
 */
export async function persistPartialComplete(
  caseId: string,
  skuQuantities: SkuQuantityDto[],
  problems: ReportedProblemDto[],
): Promise<TransitionResultDto> {
  return unwrap(
    'Teilabschluss',
    await getApiClient().POST('/api/cases/{caseId}/partial-complete', {
      params: { path: { caseId } },
      body: { skuQuantities, problems },
    }),
  );
}
