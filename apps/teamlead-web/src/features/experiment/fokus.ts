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
 * Die 3-s-Markierung des betroffenen Elements: kräftige Umrandung + auslaufend
 * pulsierender Schein — als sx-Baustein komponieren:
 * `sx={[basis, fokussiert && FOKUS_MARKIERUNG_SX]}`.
 */
export const FOKUS_MARKIERUNG_SX = {
  outline: `3px solid ${ltColors.warning}`,
  outlineOffset: '1px',
  animation: 'fokus-puls 700ms ease-in-out infinite alternate',
  '@keyframes fokus-puls': {
    from: { boxShadow: `0 0 0 3px ${alpha(ltColors.warning, 0.45)}` },
    to: { boxShadow: `0 0 0 9px ${alpha(ltColors.warning, 0)}` },
  },
};
