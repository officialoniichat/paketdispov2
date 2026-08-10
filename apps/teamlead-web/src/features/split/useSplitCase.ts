/**
 * Aufteilen anstoßen — die eine Stelle, an der das Cockpit den Split-Endpunkt ruft.
 *
 * Alle drei Oberflächen mit „Aufteilen …" (Belege-Liste, Beleg-Detail, Digitale
 * Ablagen) hängen hier dran, damit Fehlerbehandlung und Cache-Auffrischung nicht
 * dreimal leicht verschieden implementiert werden.
 *
 * Eine Aufteilung ändert auf einen Schlag Topf, Ablagen, Board und Kennzahlen (aus
 * einem Beleg werden n), deshalb wird dasselbe Schlüssel-Trio aufgefrischt, das auch
 * die übrigen Beleg-Mutationen invalidieren.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { splitCase, type SplitCaseResult } from '../../data/belege.js';
import type { SplitSubmit } from './SplitDialog.js';

export interface SplitCaseApi {
  submit: (input: SplitSubmit) => void;
  pending: boolean;
  /** Klartext-Meldung des Backends, solange der letzte Versuch scheiterte. */
  error: string | null;
  clearError: () => void;
}

export function useSplitCase(onDone: (result: SplitCaseResult) => void): SplitCaseApi {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: SplitSubmit) => splitCase(input.caseId, input.parts, input.reason),
    onSuccess: (result) => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
      void queryClient.invalidateQueries({ queryKey: ['beleg'] });
      void queryClient.invalidateQueries({ queryKey: ['belege'] });
      onDone(result);
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
