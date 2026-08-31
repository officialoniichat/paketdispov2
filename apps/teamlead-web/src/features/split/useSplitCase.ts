/**
 * Aufteilen bzw. gemeinsames Zuweisen anstoßen — die eine Stelle, an der das
 * Cockpit die beiden Dialog-Modi (Konzept beleg-zusammenarbeit §4) ans Backend
 * bringt: `'aufteilen'` legt echte Teil-Belege an (`POST …/split`),
 * `'gemeinsam'` macht aus EINEM Beleg einen geteilten Beleg
 * (`POST …/collaboration`).
 *
 * Alle drei Oberflächen mit „Aufteilen …" (Belege-Liste, Beleg-Detail, Digitale
 * Ablagen) hängen hier dran, damit Fehlerbehandlung und Cache-Auffrischung nicht
 * dreimal leicht verschieden implementiert werden.
 *
 * Beide Modi ändern auf einen Schlag Topf, Ablagen, Board und Kennzahlen,
 * deshalb wird dasselbe Schlüssel-Trio aufgefrischt, das auch die übrigen
 * Beleg-Mutationen invalidieren.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCollaboration, splitCase, type SplitCaseResult } from '../../data/belege.js';
import type { SplitSubmit } from './SplitDialog.js';

/** Ergebnis für die Erfolgsmeldung der Aufrufer — je Modus verschieden. */
export type SplitDoneResult =
  | ({ mode: 'aufteilen' } & SplitCaseResult)
  | {
      mode: 'gemeinsam';
      /** Anzeigename des Inhabers (erster Mitarbeiter, Karren); null ohne Bündel. */
      ownerName: string | null;
      /** Anzahl der Beteiligten (alle `angenommen`). */
      beteiligte: number;
    };

/**
 * Erfolgsmeldung als Satz. `teileHinweis` ist der seitenspezifische Zusatz des
 * Aufteilen-Modus (z. B. wo die Teile jetzt zu finden sind).
 */
export function splitDoneText(done: SplitDoneResult, teileHinweis: string): string {
  if (done.mode === 'aufteilen') {
    return `Beleg aufgeteilt: ${done.containerWeBelegNo} · ${done.parts.length} Teile. ${teileHinweis}`;
  }
  const wer = `${done.beteiligte} Mitarbeitende bearbeiten den Beleg gemeinsam`;
  return done.ownerName
    ? `Gemeinsam zugewiesen: ${wer} — er liegt im Karren von ${done.ownerName}.`
    : `Gemeinsam zugewiesen: ${wer}.`;
}

export interface SplitCaseApi {
  submit: (input: SplitSubmit) => void;
  pending: boolean;
  /** Klartext-Meldung des Backends, solange der letzte Versuch scheiterte. */
  error: string | null;
  clearError: () => void;
}

export function useSplitCase(onDone: (done: SplitDoneResult) => void): SplitCaseApi {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation<SplitDoneResult, Error, SplitSubmit>({
    mutationFn: async (input) => {
      if (input.mode === 'gemeinsam') {
        const result = await createCollaboration(input.caseId, input.employeeNos, input.reason);
        const inhaber = result.participants.find((p) => p.role === 'inhaber');
        return {
          mode: 'gemeinsam',
          ownerName: inhaber?.displayName ?? null,
          beteiligte: result.participants.length,
        };
      }
      const result = await splitCase(input.caseId, input.parts, input.reason);
      return { mode: 'aufteilen', ...result };
    },
    onSuccess: (done) => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
      void queryClient.invalidateQueries({ queryKey: ['beleg'] });
      void queryClient.invalidateQueries({ queryKey: ['belege'] });
      onDone(done);
    },
    onError: (err: Error) => setError(err.message),
  });

  const submit = useCallback(
    (input: SplitSubmit) => {
      setError(null);
      mutation.mutate(input);
    },
    [mutation],
  );

  return {
    submit,
    pending: mutation.isPending,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
