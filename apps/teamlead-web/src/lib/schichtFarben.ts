/**
 * Schichtfarben (Nutzer-Vorgabe): Frühschicht hellblau, Spätschicht helllila,
 * Frei orange — EINE Quelle für das Wochenmuster (Admin & Regeln), den
 * Schichtplan-Kalender und die Mitarbeiter-Matrix (Experiment DA.M.B).
 */

export type ShiftModelName = 'Frühschicht' | 'Spätschicht' | 'Frei';

export const SHIFT_MODEL_COLORS: Record<ShiftModelName, string> = {
  Frühschicht: '#81d4fa',
  Spätschicht: '#ce93d8',
  Frei: '#ffb74d',
};

export type ShiftKind = 'frueh' | 'spaet';

/** Ableitung aus dem materialisierten Schichtbeginn: vor 09:00 lokal = Früh. */
export function shiftKindOfStart(startIso: string): ShiftKind {
  return new Date(startIso).getHours() < 9 ? 'frueh' : 'spaet';
}

export function shiftKindColor(kind: ShiftKind): string {
  return kind === 'frueh' ? SHIFT_MODEL_COLORS['Frühschicht'] : SHIFT_MODEL_COLORS['Spätschicht'];
}

export function shiftKindLabel(kind: ShiftKind): string {
  return kind === 'frueh' ? 'Früh' : 'Spät';
}

export const ABSENCE_LABEL: Record<'krank' | 'urlaub', string> = {
  krank: 'Krank',
  urlaub: 'Urlaub',
};
