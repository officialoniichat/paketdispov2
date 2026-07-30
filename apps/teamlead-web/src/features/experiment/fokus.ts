/**
 * Schnellaktion-Fokus — der Sprungauftrag einer Schnellaktion (Tagescockpit/
 * Sidebar-Ausklapper) an das Experiment DA.M.B: welches Fenster in Vollbild
 * geht und welche Fälle bzw. Mitarbeiter-Zeilen dort für 3 Sekunden markiert
 * und ins Bild gescrollt werden. Reist als Router-State
 * (`navigate('/experiment', { state: { fokus } })`) und wird dort sofort
 * verbraucht (replace), damit Reload/Zurück den Fokus nicht wiederholt.
 * Ziel-Elemente tragen das Attribut `data-fokus-id` (caseId bzw. employeeNo).
 */
import { alpha } from '@mui/material/styles';
import { ltColors } from '@paket/ui';

export type FokusFenster = 'ablagen' | 'matrix';

export interface SchnellaktionFokus {
  fenster: FokusFenster;
  /** Betroffene Belege (Ablagen-Karten); erster Eintrag = Scroll-Ziel. */
  caseIds: string[];
  /** Betroffene Mitarbeiter-Zeilen der Matrix (employeeNo). */
  employeeNos: string[];
}

/** Dauer der Fokus-Markierung (Nutzer-Vorgabe: „3 sek"). */
export const FOKUS_DAUER_MS = 3000;

/** Router-State defensiv lesen — fremde/alte States liefern null. */
export function leseSchnellaktionFokus(state: unknown): SchnellaktionFokus | null {
  if (typeof state !== 'object' || state === null) return null;
  const fokus = (state as { fokus?: unknown }).fokus;
  if (typeof fokus !== 'object' || fokus === null) return null;
  const f = fokus as Partial<Record<'fenster' | 'caseIds' | 'employeeNos', unknown>>;
  if (f.fenster !== 'ablagen' && f.fenster !== 'matrix') return null;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return { fenster: f.fenster, caseIds: strings(f.caseIds), employeeNos: strings(f.employeeNos) };
}

/**
 * Die 3-s-Markierung des betroffenen Elements: der GANZE Container pulsiert
 * leicht rot mit geringer Deckkraft („das ist, wonach du gesucht hast"), dazu
 * eine dezente rote Umrandung. Als sx-Baustein komponieren:
 * `sx={[basis, fokussiert && FOKUS_MARKIERUNG_SX]}`.
 */
export const FOKUS_MARKIERUNG_SX = {
  outline: `2px solid ${alpha(ltColors.danger, 0.55)}`,
  outlineOffset: '1px',
  // Die animation gewinnt in der CSS-Kaskade über statische bgcolor der Basis —
  // der rote Schleier liegt damit zuverlässig über Karte bzw. Zeile.
  animation: 'fokus-puls 900ms ease-in-out infinite alternate',
  '@keyframes fokus-puls': {
    from: { backgroundColor: alpha(ltColors.danger, 0.08) },
    to: { backgroundColor: alpha(ltColors.danger, 0.22) },
  },
};
