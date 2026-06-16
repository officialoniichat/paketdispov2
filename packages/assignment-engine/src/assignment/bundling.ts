import type { Id } from '@paket/domain-types';
import { DEFAULT_ASSIGNMENT_CONFIG, type AssignmentConfig } from '../config.js';
import type { EnrichedCase } from '../types.js';

/**
 * createBalancedBundles (§8.3) — pack priority-sorted cases into work packages of
 * roughly equal effort. Order is preserved so priority/FIFO is never violated; a
 * package closes once it reaches the target minutes or the case cap (Rollwagen-Grenze,
 * Anhang D.2). Cases that no longer fit the remaining capacity become overflow.
 */

export type BundleKind = 'starter' | 'today';

export interface ProtoBundle {
  kind: BundleKind;
  caseIds: Id[];
  cases: EnrichedCase[];
  effortMinutes: number;
  effortPoints: number;
  /** Most frequent Warengruppe in the bundle — specialist-avoidance signal (§8.4). */
  dominantWgr: string;
  /** Bereich/Skill of the bundle (bundles are kept Bereich-homogeneous). */
  bereich?: string;
  /** True if any case in the bundle is "heavy" (for the heavy/light mix, §8.4). */
  containsHeavy: boolean;
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

export function createBalancedBundles(
  cases: readonly EnrichedCase[],
  capacityMinutes: number,
  config: AssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG,
  kind: BundleKind = 'today',
): BundlingResult {
  const bundles: ProtoBundle[] = [];
  const overflow: EnrichedCase[] = [];
  let used = 0;
  let current: EnrichedCase[] = [];
  let currentMinutes = 0;

  const close = (): void => {
    if (current.length === 0) return;
    bundles.push({
      kind,
      caseIds: current.map((c) => c.case.id),
      cases: current,
      effortMinutes: round2(current.reduce((sum, c) => sum + c.effortMinutes, 0)),
      effortPoints: round2(current.reduce((sum, c) => sum + c.effortPoints, 0)),
      dominantWgr: dominantWgr(current),
      bereich: current[0]?.bereich,
      containsHeavy: current.some((c) => c.effortMinutes >= config.heavyCaseMinutes),
    });
    current = [];
    currentMinutes = 0;
  };

  for (const c of cases) {
    if (capacityMinutes <= 0 || used >= capacityMinutes) {
      overflow.push(c);
      continue;
    }
    // Keep a bundle Bereich-homogeneous so it can be routed to a matching specialist
    // (cases without a Bereich group together).
    if (current.length > 0 && (current[0]?.bereich ?? '') !== (c.bereich ?? '')) close();
    current.push(c);
    currentMinutes += c.effortMinutes;
    used += c.effortMinutes;
    if (currentMinutes >= config.targetBundleMinutes || current.length >= config.maxCasesPerBundle) {
      close();
    }
  }
  close();

  return { bundles, overflow };
}
