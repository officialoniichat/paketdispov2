/**
 * Automatik-Schalter (Anhang E.4) — EIN persistierter Zustand für alle
 * Oberflächen: das Tagescockpit (Auto-Commit neuer freier Arbeit) und die
 * Vorverteilungs-Rückseite im DA.M.B teilen denselben
 * localStorage-Schalter, statt je eine eigene Kopie zu halten.
 */
import { useState } from 'react';

export const AUTOMATIK_KEY = 'paket.automatik';

/** An/Aus des Automatik-Schalters, persistiert unter {@link AUTOMATIK_KEY}. */
export function useAutomatik(): readonly [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTOMATIK_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const set = (v: boolean): void => {
    setOn(v);
    try {
      localStorage.setItem(AUTOMATIK_KEY, v ? 'on' : 'off');
    } catch {
      /* ignore storage errors */
    }
  };
  return [on, set] as const;
}
