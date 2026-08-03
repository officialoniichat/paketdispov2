/**
 * CatMan-Termin — der Tag, bis zu dem die Ware auf der Verkaufsfläche stehen
 * muss (Kundenfeedback: „Das Datum vom CatMan-Termin muss angezeigt werden").
 *
 * Reine KONTROLLINFORMATION: der Mitarbeiter soll prüfen können, ob ein Termin
 * knapp ist oder schon gerissen wurde. Bewusst KEIN Prioritätstreiber — hier
 * wird nichts umsortiert, nichts gewichtet und nichts gesperrt (siehe
 * `receiptPositionSchema.catMan` in @paket/domain-types). Den Termin selbst
 * liefert das Backend fertig aggregiert (frühester Termin aus Beleg-Kopf und
 * Positionen); die App formatiert ihn und vergleicht ihn gegen den Bezugstag.
 */

const CATMAN_DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Formatiert einen ISO-Tag deutsch; null ohne (oder bei unlesbarem) Termin. */
export function catManDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : CATMAN_DATE.format(d);
}

/**
 * Überfällig = der Termin liegt VOR dem Bezugstag. Beide Seiten sind ISO-Tage
 * (YYYY-MM-DD), deren lexikografische Ordnung der chronologischen entspricht —
 * der Vergleich braucht damit weder Date-Parsing noch eine Zeitzone. Ein Termin
 * HEUTE ist nicht überfällig: heute ist er fällig.
 */
export function isCatManOverdue(iso: string | null | undefined, referenceDay: string): boolean {
  if (!iso) return false;
  return iso < referenceDay;
}

/**
 * Der Gerätetag als ISO-Tag. Nur die Rückfallebene für den Bezugstag: maßgeblich
 * ist der Server-Tag aus `/api/me/today` (siehe `useReferenceDay`), solange er
 * geladen ist. Bewusst lokale Kalenderfelder statt `toISOString()` — letzteres
 * läge in UTC und damit abends einen Tag daneben.
 */
export function localDayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
