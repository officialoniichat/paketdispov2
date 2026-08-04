/**
 * Starterbündel-Status — kleine Single-Source-Brücke zwischen der
 * Vorverteilung (Starterbündel-Ansicht generiert Vorschläge) und dem
 * Schnellaktionen-Popout der Sidebar: „Starterbündel generiert" mit Anzahl,
 * Uhrzeit und Erstell-Art. Stand lebt in localStorage und wird via
 * useSyncExternalStore synchron gehalten (gleiches Muster wie das Abhaken
 * in cockpit/schnellaktionen.tsx).
 */
import { useSyncExternalStore } from 'react';

export interface StarterStatus {
  /** ISO-Zeitpunkt der Generierung. */
  generiertAm: string;
  /** Anzahl generierter Starterbündel (Kandidaten mit Engine-Vorschlag). */
  anzahl: number;
  /** true = automatisch erstellt (Toggler), false = per „Vorschlag ansehen". */
  auto: boolean;
}

const KEY = 'paket.starterbuendel.generiert';

function lese(): StarterStatus | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? null : (JSON.parse(raw) as StarterStatus);
  } catch {
    return null;
  }
}

let cache: StarterStatus | null = lese();
const listeners = new Set<() => void>();

export function schreibeStarterStatus(status: StarterStatus): void {
  cache = status;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(status));
  } catch {
    /* Storage-Fehler ignorieren — der Status ist reine Anzeige. */
  }
  listeners.forEach((l) => l());
}

/** Nur für Tests: Status vollständig zurücksetzen. */
export function starterStatusZuruecksetzen(): void {
  cache = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Der zuletzt generierte Starterbündel-Stand (null = noch nie generiert). */
export function useStarterStatus(): StarterStatus | null {
  return useSyncExternalStore(subscribe, () => cache);
}
