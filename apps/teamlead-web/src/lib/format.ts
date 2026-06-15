/** Display formatters for the cockpit (de-DE, minutes-based capacity figures). */

/** "138" -> "2 h 18 min"; "46" -> "46 min". */
export function formatMinutes(min: number): string {
  const rounded = Math.round(min);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatPct(n: number): string {
  return `${Math.round(n)} %`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n);
}

/** ISO date "2026-06-15" -> "15.06.2026". */
export function formatDate(iso?: string): string {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** ISO datetime -> "HH:mm" (local clock portion, no TZ math for the MVP view). */
export function formatTime(iso?: string): string {
  if (!iso) return '–';
  const t = iso.slice(11, 16);
  return t || '–';
}

/** ISO datetime -> "15.06. 09:12". */
export function formatDateTime(iso?: string): string {
  if (!iso) return '–';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}. ${formatTime(iso)}`;
}
