/**
 * Fertig-Gate geteilter Belege (Konzept beleg-zusammenarbeit §5.2) — reine
 * Funktionen, die EINZIGE Quelle dieser Regel:
 *
 *  - „Beleg erledigt": ALLE Positionen sind geprüft (`confirmedById` gesetzt).
 *  - „Teilabschluss": jede UNGEPRÜFTE Position ist eine Problem-Position — sie
 *    trägt eine offene Meldung, eine manuelle Meldung des Teilabschlusses oder
 *    eine implizite Abweichung auf einer ihrer Größenzeilen.
 *
 * Nicht geteilte Belege behalten das bisherige Verhalten (Client-Gate) — der
 * Aufrufer (CasesService) wendet das Gate nur bei aktiver Zusammenarbeit an.
 */

/** Positions-Ausschnitt, den das Gate braucht. */
export interface GatePosition {
  positionId: string;
  positionNo: number;
  confirmedById: string | null;
}

/** Ungeprüfte Positionen (kein Prüfer gesetzt), in Positionsreihenfolge. */
export function unconfirmedPositions(positions: readonly GatePosition[]): GatePosition[] {
  return positions.filter((p) => p.confirmedById === null);
}

/**
 * „Beleg erledigt" (voll): deutsche Fehlermeldung, wenn noch Positionen
 * ungeprüft sind — sonst `null` (erlaubt).
 */
export function completeGateError(positions: readonly GatePosition[]): string | null {
  const open = unconfirmedPositions(positions);
  if (open.length === 0) return null;
  return formatUnconfirmed(open, 'erst prüfen oder Teilabschluss verwenden');
}

/**
 * „Teilabschluss": deutsche Fehlermeldung, wenn eine ungeprüfte Position KEINE
 * Problem-Position ist — sonst `null` (erlaubt). `problemPositionIds` ist die
 * Vereinigung aus offenen Meldungen, manuellen Meldungen des Bodys und
 * impliziten Abweichungen (aufgelöst auf die Positions-Id).
 */
export function partialGateError(
  positions: readonly GatePosition[],
  problemPositionIds: ReadonlySet<string>,
): string | null {
  const open = unconfirmedPositions(positions).filter((p) => !problemPositionIds.has(p.positionId));
  if (open.length === 0) return null;
  return formatUnconfirmed(open, 'prüfen oder ein Problem dazu melden');
}

/** „Noch n Positionen ungeprüft (1, 3) – <Handlungsaufforderung>." */
function formatUnconfirmed(open: readonly GatePosition[], action: string): string {
  const nos = [...open].map((p) => p.positionNo).sort((a, b) => a - b);
  const noun = open.length === 1 ? 'Position' : 'Positionen';
  return `Noch ${open.length} ${noun} ungeprüft (${nos.join(', ')}) – ${action}.`;
}
