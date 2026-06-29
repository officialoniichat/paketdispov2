import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '@paket/assignment-engine';
import type { GoodsReceiptCase, LoadPlanRow, RuleConfig } from '@paket/domain-types';

/**
 * Verladetag-Auflösung (Teamlead-Punkt 4). The pure engine consumes a per-case
 * `loadPlanDate` (next loading day) and the configured Vorlauf; this backend helper
 * resolves that date from the LIVE Verladeplan calendar (`RuleConfig.loadPlan`) so the
 * engine never has to fetch. The dead Prisma `LoadPlanRule` table is intentionally not
 * used — `RuleConfig.loadPlan` is the only source the cockpit edits and persists.
 */

const MS_PER_DAY = 86_400_000;

/** German weekday abbreviation → JS `getUTCDay()` index (0 = Sunday). */
const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  So: 0,
  Mo: 1,
  Di: 2,
  Mi: 3,
  Do: 4,
  Fr: 5,
  Sa: 6,
};

function isoToUtcMillis(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function millisToIso(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10);
}

/**
 * Earliest date on/after `fromIso` whose weekday matches `weekdayIndex`, as ISO date.
 * Anchored to the case's booking date so a missed loading day stays in the past
 * (→ overdue) instead of rolling forward to next week.
 */
function nextWeekdayOnOrAfter(fromIso: string, weekdayIndex: number): string {
  const fromMillis = isoToUtcMillis(fromIso);
  const fromDay = new Date(fromMillis).getUTCDay();
  const delta = (weekdayIndex - fromDay + 7) % 7;
  return millisToIso(fromMillis + delta * MS_PER_DAY);
}

/** A loadPlan row applies to `today` when its validity window covers it. */
function isRowActiveOn(row: LoadPlanRow, today: string): boolean {
  if (row.validFrom > today) return false;
  if (row.validTo !== undefined && row.validTo < today) return false;
  return true;
}

/**
 * Resolve a case's next loading day from the Verladeplan calendar: match the case's
 * `primaryShopAreaNo`/`primaryFloor` against active loadPlan rows, then take the
 * earliest weekday occurrence on/after the case's booking date across all matching
 * loading weekdays. Returns `undefined` when no rule matches (caller keeps any
 * pre-existing `loadPlanDate`).
 */
export function resolveLoadPlanDate(
  goodsCase: GoodsReceiptCase,
  rows: readonly LoadPlanRow[],
  today: string,
): string | undefined {
  const shopAreaNo = goodsCase.primaryShopAreaNo;
  const floor = goodsCase.primaryFloor;
  if (shopAreaNo === undefined || floor === undefined) return undefined;

  let earliest: string | undefined;
  for (const row of rows) {
    if (row.shopAreaNo !== shopAreaNo || row.floor !== floor) continue;
    if (!isRowActiveOn(row, today)) continue;
    const weekdayIndex = WEEKDAY_INDEX[row.weekday];
    if (weekdayIndex === undefined) continue;
    const candidate = nextWeekdayOnOrAfter(goodsCase.bookingDate, weekdayIndex);
    if (earliest === undefined || candidate < earliest) earliest = candidate;
  }
  return earliest;
}

/**
 * Return a copy of each case with `loadPlanDate` resolved from the live calendar.
 * The calendar is authoritative when it matches; otherwise the case keeps whatever
 * `loadPlanDate` it already carried (immutable update — inputs are not mutated).
 */
export function applyResolvedLoadPlanDates(
  cases: readonly GoodsReceiptCase[],
  rows: readonly LoadPlanRow[],
  today: string,
): GoodsReceiptCase[] {
  return cases.map((c) => {
    const resolved = resolveLoadPlanDate(c, rows, today);
    return resolved === undefined ? c : { ...c, loadPlanDate: resolved };
  });
}

/**
 * Map the cockpit's structured {@link RuleConfig} onto the engine config the pure engine
 * consumes: the Teamlead-Punkt-4 Vorlauf (priority) and the Punkt-5 Schichtende-Cutoff
 * (shiftEnd). Other engine tuning keeps the defaults until separately wired.
 */
export function engineConfigFromRuleConfig(config: RuleConfig): EngineConfig {
  return {
    ...DEFAULT_ENGINE_CONFIG,
    // Aufwandsparameter (Teamlead-Punkt 2): the cockpit-edited effort config IS the
    // engine effort config (identical shape), so it is passed through verbatim. NB the
    // per-case effort only recomputes once position-level `effortVectors` are provided
    // to `assignWork`; until ProHandel ingestion delivers them the live run falls back
    // to each case's precomputed `estimatedMinutes` (see docs/concept/aufwandsfaktoren-wirkung.md).
    effort: config.effort,
    priority: {
      overdueLeadDays: config.priority.overdueLeadDays,
      overdueLeadDaysOverrides: config.priority.overdueLeadDaysOverrides,
    },
    // Delivery-Group detection (Teamlead-Anforderung Punkt 1).
    grouping: config.grouping,
    // Schichtende-Cutoff (Punkt 5): default 120 (DEFAULT_RULE_CONFIG.shiftEnd) so the
    // batch auto-distribution reserves the last 2h for self-pull unless reconfigured.
    shiftEnd: {
      autoCutoffMinutes: config.shiftEnd.autoCutoffMinutes,
    },
  };
}
