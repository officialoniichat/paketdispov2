/**
 * Binds the pure per-Beleg workflow to the live backend (React Query).
 *
 * Das Aggregat (`case` + Arbeitsanweisung + Positionen) ist
 * `data/useCaseAggregate.ts` — die einzige Wahrheit des Belegs. Seit der
 * Beleg-Zusammenarbeit (31.08.2026) gehört dazu auch der ARBEITSSTAND: „Position
 * geprüft" (`positions[].confirmedBy`) und Ist-Menge/Preiskorrektur je Größe
 * (`skuLines[].confirmedQuantity/correctedVkPrice`) werden pro Aktion
 * persistiert — für alle Belege, nicht nur geteilte (Konzept §2: eine Wahrheit
 * statt zwei Pfade). Der frühere Client-Zustand
 * (`quantityCheckedPositionIds`/`confirmedQuantities`/`correctedVkPrices`) ist
 * damit ersatzlos entfallen; er ging beim Neuladen verloren und hätte bei
 * mehreren Beteiligten zwei Stände erzeugt. Lokal bleibt nur, was es
 * serverseitig nicht gibt: die bis zum Teilabschluss gesammelten manuellen
 * Meldungen (`CaseProgress.problems`).
 *
 * Jede Aktion ist optimistisch (Lager-WLAN): der Aggregat-Cache reagiert sofort,
 * der POST folgt, ein Fehler rollt zurück und erscheint als `actionError` —
 * nichts wird stillschweigend geschluckt. Die Mengen-Eingabe ist je Größenzeile
 * um {@link COUNT_DEBOUNCE_MS} entprellt, damit ein gehaltener „+"-Knopf nicht
 * je Tipp einen Request auslöst.
 *
 * Case-level milestones (start-preparation/complete/partial-complete) patchen
 * zusätzlich den Status in der `['me','today']`-Liste (siehe `runMilestone`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { CaseStatus } from '@paket/domain-types';
import type { components } from '@paket/api-client';
import {
  caseAggregateKey,
  useCaseAggregate,
  type CaseAggregateDto,
} from '../data/useCaseAggregate.js';
import { mapCaseAggregate } from '../data/caseAggregateMapper.js';
import { useConfirmPosition } from '../data/useConfirmPosition.js';
import { patchSkuLine, useCountSku, type SkuLinePatch } from '../data/useCountSku.js';
import { usePartDone } from '../data/usePartDone.js';
import {
  persistComplete,
  persistPartialComplete,
  persistStartPreparation,
} from '../data/persist.js';
import type { CaseAggregate, CaseProgress, RecordedProblem } from '../domain/types.js';
import {
  addProblem as addProblemTx,
  initialProgress,
  problemsBody,
  removeProblem as removeProblemTx,
  skuQuantitiesBody,
} from './workflowModel.js';

type TodayResponseDto = components['schemas']['TodayResponseDto'];

/** Entprellung der Mengen-/Preis-Eingabe je Größenzeile (Konzept §3.6). */
export const COUNT_DEBOUNCE_MS = 400;

/**
 * Nur aus diesen Status heraus darf der Mitarbeiter den Beleg bearbeiten. Alles
 * andere (completed, zst_done, issue_open, cancelled, …) ist in der PWA reine
 * Ansicht: die §7.1-State-Machine des Backends kennt von dort keinen Weg zurück
 * nach in_progress — ein Start-/Abschluss-POST würde mit 400 abgelehnt.
 */
const EDITABLE_STATUSES: readonly CaseStatus[] = ['assigned', 'in_progress', 'problem_resolved'];

/**
 * Der Start-Übergang (start-preparation) ist nur aus assigned/problem_resolved
 * eine legale Kante. Ein Beleg, der bereits in_progress ist (z. B. nach einem
 * Seiten-Reload), braucht KEINEN neuen Start — in_progress → in_progress wäre
 * ebenfalls illegal.
 */
const STARTABLE_STATUSES: readonly CaseStatus[] = ['assigned', 'problem_resolved'];

export interface CaseFlow {
  loading: boolean;
  isError: boolean;
  error: unknown;
  aggregate?: CaseAggregate;
  progress?: CaseProgress;
  /**
   * True, sobald der Beleg-Status keine Bearbeitung mehr erlaubt (fertig,
   * Problemfall, storniert). Die UI zeigt dann eine reine Ansicht; alle
   * Mutationen dieses Hooks sind zusätzlich selbst abgesichert (no-op).
   */
  readOnly: boolean;
  /** Last failed action's message, or undefined. Never swallowed silently. */
  actionError?: string;
  clearActionError: () => void;
  /** „Position geprüft" setzen/zurücknehmen — serverseitig, für alle sichtbar. */
  togglePositionChecked: (positionId: string) => Promise<void>;
  setSkuQuantity: (skuLineId: string, quantity: number, expectedQuantity: number) => void;
  /** Preisabweichung (Punkt 4): korrigierter VK je Größe (undefined = keine Korrektur). */
  setCorrectedVkPrice: (
    skuLineId: string,
    price: number | undefined,
    vkLabelPrice: number | undefined,
  ) => void;
  /** Manuell erfasstes Positions-Problem lokal sammeln (Punkt 6). */
  addProblem: (problem: RecordedProblem) => void;
  /** Ein gesammeltes Problem wieder entfernen (vor dem Teilabschluss). */
  removeProblem: (problemId: string) => void;
  /** Resolves `true` on success, `false` on a surfaced (non-thrown) failure. */
  complete: () => Promise<boolean>;
  partialComplete: () => Promise<boolean>;
  /** „Teilbeleg erledigt": die EIGENE Beteiligung ist fertig (geteilter Beleg). */
  partDone: () => Promise<boolean>;
  /** True, solange der part-done-POST läuft — sperrt den Knopf gegen Doppeltipp. */
  partDonePending: boolean;
  refetch: () => void;
}

const TODAY_KEY = ['me', 'today'] as const;

function progressQueryKey(caseId: string): readonly [string, string, string] {
  return ['local', 'caseProgress', caseId] as const;
}

/** Deutscher Fehlertext einer abgelehnten Aktion (Backend-Meldung, sonst generisch). */
function actionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'Aktion fehlgeschlagen';
}

export function useCaseFlow(caseId: string): CaseFlow {
  const queryClient = useQueryClient();
  const aggregateQuery = useCaseAggregate(caseId);
  const aggregate = aggregateQuery.data ? mapCaseAggregate(caseId, aggregateQuery.data) : undefined;
  const caseStatus = aggregate?.case.status;
  const readOnly = caseStatus !== undefined && !EDITABLE_STATUSES.includes(caseStatus);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const confirmPosition = useConfirmPosition();
  const countSku = useCountSku();
  const partDoneMutation = usePartDone();

  const key = progressQueryKey(caseId);
  const progressQuery = useQuery({
    queryKey: key,
    queryFn: () => initialProgress(aggregate as CaseAggregate),
    enabled: aggregate !== undefined,
    staleTime: Infinity,
  });
  const progress = progressQuery.data;

  const applyLocal = useCallback(
    (transition: (p: CaseProgress) => CaseProgress): void => {
      // Nur-Ansicht: kein lokaler Fortschritt an einem fertigen/gesperrten Beleg —
      // die UI blendet die Controls aus, dieser Guard sichert es zusätzlich ab.
      if (readOnly) return;
      const current = queryClient.getQueryData<CaseProgress>(key);
      if (!current) return;
      queryClient.setQueryData<CaseProgress>(key, transition(current));
    },
    [queryClient, key, readOnly],
  );

  /**
   * Optimistically patch the case's status in the `['me','today']` list cache,
   * await the real POST, invalidate on success. On failure, roll the patch
   * back and surface the error via `actionError` — never swallow it.
   */
  const runMilestone = useCallback(
    async (nextStatus: string, post: () => Promise<{ status: string }>): Promise<boolean> => {
      const previousToday = queryClient.getQueryData<TodayResponseDto>(TODAY_KEY);
      if (previousToday) {
        queryClient.setQueryData<TodayResponseDto>(TODAY_KEY, {
          ...previousToday,
          cases: previousToday.cases.map((c) =>
            c.id === caseId ? { ...c, status: nextStatus } : c,
          ),
        });
      }
      try {
        await post();
      } catch (err) {
        if (previousToday) queryClient.setQueryData(TODAY_KEY, previousToday);
        setActionError(actionErrorMessage(err));
        // Der lokale Stand kann dem Server hinterherhängen (z. B. Beleg wurde auf
        // einem anderen Gerät abgeschlossen): nach einem abgelehnten Übergang die
        // Wahrheit neu laden, damit die UI in den korrekten (ggf. Nur-Ansicht-)
        // Zustand wechselt statt weitere illegale Aktionen anzubieten.
        void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
        void queryClient.invalidateQueries({ queryKey: caseAggregateKey(caseId) });
        return false;
      }
      setActionError(undefined);
      void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
      void queryClient.invalidateQueries({ queryKey: caseAggregateKey(caseId) });
      return true;
    },
    [queryClient, caseId],
  );

  /**
   * Erste erfasste Aktion → den Beleg auf dem Server in Bearbeitung setzen.
   *
   * AWAITBAR (31.08.2026): der Prüf-Haken und die Mengen-Erfassung sind jetzt
   * eigene Endpunkte, die einen Beleg `in_progress` verlangen — sie müssen den
   * Start also abwarten, sonst antwortet das Backend mit 409. Der laufende
   * Start wird in einer Ref gemerkt, damit zwei schnelle Tipper nicht zwei
   * (beim zweiten illegale) Übergänge auslösen; nur ein GESCHEITERTER Start
   * wird erneut versucht.
   */
  const startRef = useRef<Promise<boolean> | null>(null);
  const ensureStarted = useCallback(async (): Promise<void> => {
    if (caseStatus === undefined || !STARTABLE_STATUSES.includes(caseStatus)) return;
    if (startRef.current === null) {
      startRef.current = runMilestone('in_progress', () => persistStartPreparation(caseId)).then(
        (ok) => {
          if (!ok) startRef.current = null;
          return ok;
        },
      );
    }
    await startRef.current;
  }, [runMilestone, caseId, caseStatus]);

  const togglePositionChecked = useCallback(
    async (positionId: string): Promise<void> => {
      if (readOnly) return;
      const cached = queryClient.getQueryData<CaseAggregateDto>(caseAggregateKey(caseId));
      const position = cached?.positions.find((p) => p.id === positionId);
      if (!position) return;
      const confirmed = !position.confirmedBy;
      await ensureStarted();
      try {
        await confirmPosition.mutateAsync({ caseId, positionId, confirmed });
        setActionError(undefined);
      } catch (err) {
        setActionError(actionErrorMessage(err));
      }
    },
    [queryClient, caseId, readOnly, ensureStarted, confirmPosition],
  );

  /**
   * Entprellte Zähl-Erfassung je Größenzeile: der Timer trägt den akkumulierten
   * Patch der EIGENEN Eingaben, und der POST schickt beim Auslaufen genau diesen
   * Patch — NICHT den neu gelesenen Cache, den ein dazwischen landender Refetch
   * (onSettled-Invalidierung, SSE-Echo) längst überschrieben haben kann. Nur
   * berührte Felder gehen in den Request: am geteilten Beleg darf eine
   * Mengen-Eingabe nicht die Preiskorrektur eines anderen Beteiligten löschen,
   * die im eigenen Cache noch fehlt (der Zähl-Endpunkt ist ein Teil-Update).
   * Ein zweiter Tipp auf dieselbe Zeile verlängert den Timer und erweitert den
   * Patch, statt einen zweiten Request zu erzeugen.
   */
  const countTimers = useRef(
    new Map<string, { patch: SkuLinePatch; timer: ReturnType<typeof setTimeout> }>(),
  );
  const flushCount = useCallback(
    async (skuLineId: string): Promise<void> => {
      const pending = countTimers.current.get(skuLineId);
      if (!pending) return;
      countTimers.current.delete(skuLineId);
      clearTimeout(pending.timer);
      await ensureStarted();
      try {
        await countSku.mutateAsync({ caseId, skuLineId, ...pending.patch });
        setActionError(undefined);
      } catch (err) {
        setActionError(actionErrorMessage(err));
      }
    },
    [caseId, ensureStarted, countSku],
  );

  const scheduleCount = useCallback(
    (skuLineId: string, patch: SkuLinePatch): void => {
      const pending = countTimers.current.get(skuLineId);
      if (pending) clearTimeout(pending.timer);
      countTimers.current.set(skuLineId, {
        patch: { ...pending?.patch, ...patch },
        timer: setTimeout(() => void flushCount(skuLineId), COUNT_DEBOUNCE_MS),
      });
    },
    [flushCount],
  );

  /** Alle offenen Zähl-Timer sofort senden (vor „Beleg erledigt"/Teilabschluss). */
  const flushAllCounts = useCallback(async (): Promise<void> => {
    await Promise.all([...countTimers.current.keys()].map((skuLineId) => flushCount(skuLineId)));
  }, [flushCount]);

  // Beim Verlassen des Bildschirms die letzte Eingabe SOFORT senden — sonst ginge
  // der zuletzt getippte Wert verloren, obwohl er schon auf dem Schirm steht.
  //
  // Der Aufräumer darf NUR beim Aushängen laufen: `flushCount` bekommt bei jedem
  // Rendern eine neue Identität (React Query gibt je Render ein neues
  // Mutations-Objekt zurück), stünde es in den Abhängigkeiten, liefe der
  // Aufräumer bei jedem Rendern — und die Entprellung wäre wirkungslos. Deshalb
  // hält eine Ref die jeweils aktuelle Funktion.
  const timers = countTimers.current;
  const flushRef = useRef(flushCount);
  useEffect(() => {
    flushRef.current = flushCount;
  }, [flushCount]);
  useEffect(
    () => () => {
      // Schnappschuss der Keys: der Flush räumt seinen Map-Eintrag selbst ab.
      for (const skuLineId of [...timers.keys()]) {
        void flushRef.current(skuLineId);
      }
    },
    [timers],
  );

  /**
   * MEINE Sitzungs-Eingaben je Größenzeile (letzter Wert je Feld, über Flushes
   * hinweg). Nur diese Zeilen gehen mit genau diesen Werten in die
   * `skuQuantities` des (Teil-)Abschlusses — fremde Zeilen bleiben draußen und
   * Cache-Echos (ein Refetch kann den optimistischen Patch überschrieben haben)
   * verfälschen den Body nicht.
   */
  const ownInputs = useRef(new Map<string, SkuLinePatch>());

  /** Optimistischer Zeilen-Patch + entprellter Flush GENAU dieses Patches. */
  const applyCountPatch = useCallback(
    (skuLineId: string, patch: SkuLinePatch): void => {
      // Ein laufender Refetch darf den optimistischen Patch nicht überschreiben
      // (wie im onMutate von useCountSku, nur ohne dessen await).
      void queryClient.cancelQueries({ queryKey: caseAggregateKey(caseId) });
      patchSkuLine(queryClient, caseId, skuLineId, patch);
      ownInputs.current.set(skuLineId, { ...ownInputs.current.get(skuLineId), ...patch });
      scheduleCount(skuLineId, patch);
    },
    [queryClient, caseId, scheduleCount],
  );

  const setSkuQuantity = useCallback(
    (skuLineId: string, quantity: number, expectedQuantity: number): void => {
      if (readOnly) return;
      const next = Math.max(0, quantity);
      // Ist = Soll ⇒ Erfassung zurücksetzen: die Zeile ist dann wieder unberührt
      // und geht mit dem Soll in Abschluss/ZST ein (Konzept §7).
      applyCountPatch(skuLineId, { confirmedQuantity: next === expectedQuantity ? null : next });
    },
    [readOnly, applyCountPatch],
  );

  const setCorrectedVkPrice = useCallback(
    (skuLineId: string, price: number | undefined, vkLabelPrice: number | undefined): void => {
      if (readOnly) return;
      // Ein Preis gleich dem VK-Etikett-Preis (oder keiner) ist keine Korrektur.
      const corrected = price === undefined || price < 0 || price === vkLabelPrice ? null : price;
      applyCountPatch(skuLineId, { correctedVkPrice: corrected });
    },
    [readOnly, applyCountPatch],
  );

  const addProblem = useCallback(
    (problem: RecordedProblem): void => {
      void ensureStarted();
      applyLocal((p) => addProblemTx(p, problem));
    },
    [applyLocal, ensureStarted],
  );

  const removeProblem = useCallback(
    (problemId: string): void => {
      applyLocal((p) => removeProblemTx(p, problemId));
    },
    [applyLocal],
  );

  const complete = useCallback(async (): Promise<boolean> => {
    if (!progress || !aggregate || readOnly) return false;
    // Eine gerade getippte/zurückgesetzte Zeile hängt sonst noch im Timer: erst
    // senden, dann abschließen — sonst lehnt der Server mit einer Abweichung ab,
    // die der Bildschirm gar nicht mehr zeigt.
    await flushAllCounts();
    const body = skuQuantitiesBody(aggregate, ownInputs.current);
    return runMilestone('completed', () => persistComplete(caseId, body));
  }, [runMilestone, flushAllCounts, caseId, progress, aggregate, readOnly]);

  const partialComplete = useCallback(async (): Promise<boolean> => {
    if (!progress || !aggregate || readOnly) return false;
    await flushAllCounts();
    const skuBody = skuQuantitiesBody(aggregate, ownInputs.current);
    const probBody = problemsBody(progress);
    // Der Beleg bleibt beim selben MA rot geparkt (issue_open), bis der Teamlead klärt.
    return runMilestone('issue_open', () => persistPartialComplete(caseId, skuBody, probBody));
  }, [runMilestone, flushAllCounts, caseId, progress, aggregate, readOnly]);

  const partDone = useCallback(async (): Promise<boolean> => {
    if (readOnly) return false;
    try {
      await partDoneMutation.mutateAsync({ caseId });
      setActionError(undefined);
      return true;
    } catch (err) {
      setActionError(actionErrorMessage(err));
      return false;
    }
  }, [caseId, readOnly, partDoneMutation]);

  return {
    loading: aggregateQuery.isLoading || (aggregate !== undefined && progressQuery.isLoading),
    isError: aggregateQuery.isError,
    error: aggregateQuery.error,
    aggregate,
    progress,
    readOnly,
    actionError,
    clearActionError: () => setActionError(undefined),
    togglePositionChecked,
    setSkuQuantity,
    setCorrectedVkPrice,
    addProblem,
    removeProblem,
    complete,
    partialComplete,
    partDone,
    partDonePending: partDoneMutation.isPending,
    refetch: () => void aggregateQuery.refetch(),
  };
}
