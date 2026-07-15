import type { ISODateTime } from '@paket/domain-types';

/**
 * Abschluss-Rechenkerne (§15.1 ZST-Zielbild). Der Ablauf selbst (Beleg erledigt
 * vs. Teilabschluss mit Problemen) lebt im CasesService + der State-Machine
 * (§7.1); die impliziten Probleme in `../issue/derive-problems`.
 */

/** Processing duration in whole minutes between two ISO timestamps (≥ 0). */
export function processingMinutes(
  startedAt: ISODateTime | undefined,
  completedAt: ISODateTime,
): number {
  if (!startedAt) return 0;
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  return ms > 0 ? Math.round(ms / 60_000) : 0;
}

/** Effort points earned for a partially completed quantity (proportional, 2 decimals). */
export function proratedEffort(total: number, completed: number, effortPoints: number): number {
  if (total <= 0 || completed <= 0) return 0;
  const ratio = Math.min(completed / total, 1);
  return Math.round(effortPoints * ratio * 100) / 100;
}
