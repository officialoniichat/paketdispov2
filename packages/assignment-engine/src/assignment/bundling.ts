import type { Id } from '@paket/domain-types';
import { DEFAULT_ASSIGNMENT_CONFIG, type AssignmentConfig } from '../config.js';
import type { EnrichedCase } from '../types.js';

/**
 * createBalancedBundles (§8.3, Teamlead-Feedback C1/C2) — pack priority-sorted cases
 * into TEILE-dimensionierte Arbeitspakete: ein Pack nimmt Belege auf, bis es die
 * Mindest-Teile erreicht, und schließt, bevor es die Maximal-Teile überschreitet
 * (Starter-Pack 200–250, Folge-Pack 80–90). Order is preserved so priority/FIFO is
 * never violated. Es gibt KEINE Beleg-Obergrenze je Pack mehr (Shop 31 = viele
 * NOS-Einzelanlieferungen) und keine schwer/leicht-Gewichtung.
 *
 * MINUTEN bleiben die Machbarkeits-Währung: `capacityMinutes` deckelt die insgesamt
 * gepackte Arbeit über das unveränderte Aufwandsmodell (effortMinutes je Beleg);
 * Belege jenseits des Budgets werden overflow (bleiben im Pool).
 */

export type BundleKind = 'starter' | 'follow_up';

export interface ProtoBundle {
  kind: BundleKind;
  caseIds: Id[];
  cases: EnrichedCase[];
  /** Summe der Teile im Pack — die Dimensionierungs-Größe (C1). */
  teile: number;
  effortMinutes: number;
  effortPoints: number;
  /** Most frequent Warengruppe in the bundle — specialist-avoidance signal (§8.4). */
  dominantWgr: string;
  /** Bereich/Skill of the bundle (bundles are kept Bereich-homogeneous). */
  bereich?: string;
}

export interface BundlingResult {
  bundles: ProtoBundle[];
  overflow: EnrichedCase[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dominantWgr(cases: readonly EnrichedCase[]): string {
  const counts = new Map<string, number>();
  for (const c of cases) {
    for (const wgr of c.wgrCodes) counts.set(wgr, (counts.get(wgr) ?? 0) + 1);
  }
  let best = '';
  let bestCount = -1;
  for (const [wgr, count] of counts) {
    if (count > bestCount || (count === bestCount && wgr < best)) {
      best = wgr;
      bestCount = count;
    }
  }
  return best;
}

/** Pack-Größe (Teile) für die Bündel-Art aus der Konfiguration. */
function packSize(config: AssignmentConfig, kind: BundleKind): { min: number; max: number } {
  return kind === 'starter'
    ? { min: config.starterPackMinTeile, max: config.starterPackMaxTeile }
    : { min: config.followUpPackMinTeile, max: config.followUpPackMaxTeile };
}

export interface BundlingOptions {
  /**
   * caseId → delivery-group id (Teamlead-Punkt 1). Eine physische Lieferung bleibt
   * IM SELBEN Pack zusammen: ein Pack schließt nicht mitten in einer Gruppe — auch
   * über die max-Teile hinaus (das Minuten-Budget deckelt weiterhin). Kohäsion lebt
   * seit dem Ein-Pack-je-Mitarbeiter-Modell (C3) hier in der Packung, nicht mehr in
   * der Verteilung.
   */
  groupIdByCaseId?: ReadonlyMap<Id, string>;
}

export function createBalancedBundles(
  cases: readonly EnrichedCase[],
  capacityMinutes: number,
  config: AssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG,
  kind: BundleKind = 'starter',
  options: BundlingOptions = {},
): BundlingResult {
  const { min: minTeile, max: maxTeile } = packSize(config, kind);
  const bundles: ProtoBundle[] = [];
  const overflow: EnrichedCase[] = [];
  let usedMinutes = 0;
  let current: EnrichedCase[] = [];
  let currentTeile = 0;

  const close = (): void => {
    if (current.length === 0) return;
    bundles.push({
      kind,
      caseIds: current.map((c) => c.case.id),
      cases: current,
      teile: current.reduce((sum, c) => sum + c.teile, 0),
      effortMinutes: round2(current.reduce((sum, c) => sum + c.effortMinutes, 0)),
      effortPoints: round2(current.reduce((sum, c) => sum + c.effortPoints, 0)),
      dominantWgr: dominantWgr(current),
      bereich: current[0]?.bereich,
    });
    current = [];
    currentTeile = 0;
  };

  const groupOf = (e: EnrichedCase): string | undefined =>
    options.groupIdByCaseId?.get(e.case.id);
  /** True when `c` belongs to the same delivery group as the pack's last case. */
  const continuesGroup = (c: EnrichedCase): boolean => {
    const last = current[current.length - 1];
    if (!last) return false;
    const g = groupOf(c);
    return g !== undefined && g === groupOf(last);
  };

  for (const [index, c] of cases.entries()) {
    // Minutes feasibility (unchanged effort model): stop packing past the budget.
    if (capacityMinutes <= 0 || usedMinutes >= capacityMinutes) {
      overflow.push(c);
      continue;
    }
    // Keep a bundle Bereich-homogeneous so it can be routed to a matching specialist
    // (cases without a Bereich group together).
    if (current.length > 0 && (current[0]?.bereich ?? '') !== (c.bereich ?? '')) close();
    // Teile-Obergrenze: schließt das Pack, bevor der Beleg es über max hebt — AUSSER
    // der Beleg setzt die Liefergruppe des Packs fort (eine physische Lieferung bleibt
    // auf einer Person). Ein einzelner Beleg über max bildet sein eigenes Pack.
    if (current.length > 0 && currentTeile + c.teile > maxTeile && !continuesGroup(c)) close();
    current.push(c);
    currentTeile += c.teile;
    usedMinutes += c.effortMinutes;
    // Ab min Teile schließen — aber nie mitten in einer Liefergruppe.
    const next = cases[index + 1];
    const nextContinuesGroup =
      next !== undefined && groupOf(next) !== undefined && groupOf(next) === groupOf(c);
    if (currentTeile >= minTeile && !nextContinuesGroup) close();
  }
  close();

  return { bundles, overflow };
}
