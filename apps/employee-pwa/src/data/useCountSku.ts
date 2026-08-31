/**
 * `POST /api/cases/:caseId/sku-lines/:skuLineId/count` — Ist-Menge und
 * Preiskorrektur je Größenzeile (Beleg-Zusammenarbeit 31.08.2026, Konzept §7).
 *
 * Auch das ist jetzt pro Aktion persistiert: was einer zählt, sehen alle
 * Beteiligten, und der Stand überlebt das Neuladen. Der Endpunkt ist ein
 * TEIL-Update: ein weggelassenes Feld bleibt unangetastet (am geteilten Beleg
 * darf eine Mengen-Eingabe nicht die Preiskorrektur eines anderen Beteiligten
 * überschreiben — und umgekehrt); `null` setzt den jeweiligen Wert zurück
 * (Zeile wieder offen bzw. Korrektur zurückgenommen).
 *
 * Muster wie `useSetCollected`: optimistischer Patch des Aggregat-Caches,
 * Rollback bei Fehler, `onSettled` holt die Server-Wahrheit nach. Die Eingabe im
 * Bildschirm ist entprellt (siehe `workflow/useCaseFlow.ts`), damit ein
 * gehaltener „+"-Knopf nicht je Tipp einen Request auslöst.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';
import { caseAggregateKey, type CaseAggregateDto } from './useCaseAggregate.js';

/** Feldweiser Patch einer Größenzeile im Aggregat-Cache (undefined = unberührt). */
export interface SkuLinePatch {
  confirmedQuantity?: number | null;
  correctedVkPrice?: number | null;
}

/**
 * Schreibt den Patch sofort in den Aggregat-Cache — dieselbe Projektion nutzen
 * die optimistische Mutation hier UND die entprellte Eingabe im Bildschirm
 * (`workflow/useCaseFlow.ts`), damit „+"/„−" ohne Wartezeit reagieren.
 */
export function patchSkuLine(
  queryClient: QueryClient,
  caseId: string,
  skuLineId: string,
  patch: SkuLinePatch,
): void {
  queryClient.setQueryData<CaseAggregateDto>(caseAggregateKey(caseId), (old) =>
    old
      ? {
          ...old,
          positions: old.positions.map((pos) => ({
            ...pos,
            skuLines: pos.skuLines.map((sku) =>
              sku.id === skuLineId
                ? {
                    ...sku,
                    ...(patch.confirmedQuantity === undefined
                      ? {}
                      : { confirmedQuantity: patch.confirmedQuantity }),
                    ...(patch.correctedVkPrice === undefined
                      ? {}
                      : { correctedVkPrice: patch.correctedVkPrice }),
                  }
                : sku,
            ),
          })),
        }
      : old,
  );
}

/** Mindestens ein Feld muss gesetzt sein (das DTO verlangt es serverseitig). */
export interface CountSkuInput {
  caseId: string;
  skuLineId: string;
  /** Gezählte Ist-Menge; null = Erfassung zurücksetzen, weglassen = unangetastet. */
  confirmedQuantity?: number | null;
  /** Korrigierter VK; null = Korrektur zurücknehmen, weglassen = unangetastet. */
  correctedVkPrice?: number | null;
}

export function useCountSku() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      caseId,
      skuLineId,
      confirmedQuantity,
      correctedVkPrice,
    }: CountSkuInput) => {
      const response = await getApiClient().POST(
        '/api/cases/{caseId}/sku-lines/{skuLineId}/count',
        {
          params: { path: { caseId, skuLineId } },
          body: {
            ...(confirmedQuantity !== undefined ? { confirmedQuantity } : {}),
            ...(correctedVkPrice !== undefined ? { correctedVkPrice } : {}),
          },
        },
      );
      return handleApiResponse(response);
    },
    onMutate: async ({ caseId, skuLineId, confirmedQuantity, correctedVkPrice }) => {
      const key = caseAggregateKey(caseId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CaseAggregateDto>(key);
      patchSkuLine(queryClient, caseId, skuLineId, { confirmedQuantity, correctedVkPrice });
      return { previous, key };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _error, { caseId }) => {
      void queryClient.invalidateQueries({ queryKey: caseAggregateKey(caseId) });
    },
  });
}
