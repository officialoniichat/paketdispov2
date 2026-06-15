import type { GoodsReceiptCase, PriorityFlag } from '@paket/domain-types';
import { DEFAULT_RESERVE_CONFIG, type ReserveConfig } from '../config.js';
import type { ReserveResult } from '../types.js';

/**
 * Eiserne Reserve (Anhang B.2). Work deliberately held back so the next morning's
 * early shift has something to start on. Mode `max_of_percentage_and_minutes_per_employee`
 * takes the larger of a percentage of next-morning capacity and a per-employee minimum.
 */

export interface ReserveInput {
  plannedEmployeeCount: number;
  nextMorningCapacityMinutes: number;
  config?: ReserveConfig;
}

export function computeIronReserve(input: ReserveInput): ReserveResult {
  const config = input.config ?? DEFAULT_RESERVE_CONFIG;
  if (!config.enabled) {
    return { minutes: 0, byPercentage: 0, byMinimumPerEmployee: 0 };
  }
  const byPercentage = Math.round(
    config.percentageOfNextMorningCapacity * input.nextMorningCapacityMinutes,
  );
  const byMinimumPerEmployee = Math.round(
    config.minimumMinutesPerPlannedEmployee * input.plannedEmployeeCount,
  );
  return {
    minutes: Math.max(byPercentage, byMinimumPerEmployee),
    byPercentage,
    byMinimumPerEmployee,
  };
}

/**
 * Whether a case with these priority flags may consume the reserve (B.2
 * `overrideAllowedFor`). Prio/CatMan/overdue/manual-Teamlead are never held back.
 */
export function canConsumeReserve(
  flags: readonly PriorityFlag[],
  config: ReserveConfig = DEFAULT_RESERVE_CONFIG,
): boolean {
  return flags.some((flag) => config.overrideAllowedFor.includes(flag));
}

// ---------------------------------------------------------------------------
// Reserve status model (Reserve & Starterpaket concept §5/§6)
// ---------------------------------------------------------------------------

/**
 * Reserve lifecycle state for the cockpit (replaces the ambiguous boolean):
 * - `disabled`     — the reserve rule is switched off in Admin/Regeln.
 * - `no_early_shift` — enabled, but no early-shift worker resolved → target 0 is
 *                      legitimate (nothing to bridge), NOT a satisfied reserve.
 * - `at_risk`      — target > 0 and the holdable backlog falls short (Leerlauf risk).
 * - `satisfied`    — target > 0 and the holdable backlog meets the floor.
 */
export type ReserveState = 'satisfied' | 'at_risk' | 'disabled' | 'no_early_shift';

/**
 * The eiserne-Reserve rule values, exactly as edited in Admin/Regeln
 * (`@paket/domain-types` `reserveRuleConfigSchema`). The backend maps the persisted
 * RuleConfig.reserve onto this shape so the engine is driven by the single source
 * of truth — there is no second, divergent reserve config.
 */
export interface ReserveRuleValues {
  enabled: boolean;
  morningGapMinutes: number;
  /** Sections never held back overnight (concept §5.1; e.g. NOS(4)/Extra(7)/NOS-NO(8)). */
  neverReserveSections: readonly number[];
  /** Priority flags that disqualify a case from being held back (concept §5.1). */
  neverReserveFlags: readonly PriorityFlag[];
  /** When true, a held case must not breach its Catmandatum/Verladetag. */
  respectDeadlines: boolean;
}

export interface ReserveStatusInput {
  /** Current ready pool (carryover candidates for tomorrow's morning). */
  cases: GoodsReceiptCase[];
  /**
   * Resolved early-shift worker count (concept §5). The backend resolves this from
   * the configured `earlyShiftSource` (next working morning's shifts, or today's
   * active-shift proxy). Each worker needs `morningGapMinutes` of startable carryover
   * to bridge the morning gap → `target = earlyShiftWorkerCount × morningGapMinutes`.
   */
  earlyShiftWorkerCount: number;
  /** Planning date (YYYY-MM-DD) the reserve is being sized for. */
  date: string;
  /** The Admin/Regeln reserve rule values (single source of truth). */
  rule: ReserveRuleValues;
}

/**
 * Pure, deadline-aware view of the eiserne Reserve + tomorrow's Starterpaket
 * (concept §5/§6). Reports the lifecycle state, the target floor, the holdable
 * backlog that can secure it, and the belege/minutes that would form the morning
 * starter — without mutating the pool or selecting an assignment.
 */
export interface ReserveStatus {
  /** Lifecycle state for the cockpit (never an ambiguous "satisfied with target 0"). */
  state: ReserveState;
  /** R = earlyShiftWorkerCount × morningGapMinutes (concept §5). */
  targetMinutes: number;
  /** Raw sum of holdable, deadline-safe `ready` backlog minutes. */
  securedMinutes: number;
  /** Belege that would form tomorrow's starter (capped at the target worth). */
  starterBelegCount: number;
  /** Σ estimatedMinutes of those starter belege. */
  starterMinutes: number;
}

/**
 * A case is holdable into the next morning (concept §5.1/§5.3) when it is a `ready`
 * carryover candidate that is neither everyday/urgent by section nor flagged urgent,
 * and (when `respectDeadlines`) holding it overnight does not breach its
 * Catmandatum/Verladetag.
 */
function isHoldable(c: GoodsReceiptCase, date: string, rule: ReserveRuleValues): boolean {
  if (c.status !== 'ready') return false;
  if (c.section !== null && rule.neverReserveSections.includes(c.section)) return false;
  if (c.priorityFlags.some((flag) => rule.neverReserveFlags.includes(flag))) return false;
  if (rule.respectDeadlines) {
    // Deadline-safe: holding overnight is only safe if both deadlines are strictly
    // after the planning date (a same-day/next-cycle deadline must be worked now).
    if (c.catManDate !== undefined && c.catManDate <= date) return false;
    if (c.loadPlanDate !== undefined && c.loadPlanDate <= date) return false;
  }
  return true;
}

/** Stable starter order (concept §6): Verladetag asc, then booking FIFO. */
function compareStarterOrder(a: GoodsReceiptCase, b: GoodsReceiptCase): number {
  const loadA = a.loadPlanDate ?? '￿';
  const loadB = b.loadPlanDate ?? '￿';
  if (loadA !== loadB) return loadA < loadB ? -1 : 1;
  if (a.bookingDate !== b.bookingDate) return a.bookingDate < b.bookingDate ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function computeReserveStatus(input: ReserveStatusInput): ReserveStatus {
  const { rule } = input;

  // Disabled rule: no reserve held, no target, neutral state.
  if (!rule.enabled) {
    return {
      state: 'disabled',
      targetMinutes: 0,
      securedMinutes: 0,
      starterBelegCount: 0,
      starterMinutes: 0,
    };
  }

  const earlyShiftWorkerCount = Math.max(0, input.earlyShiftWorkerCount);
  const targetMinutes = earlyShiftWorkerCount * rule.morningGapMinutes;

  const holdable = input.cases
    .filter((c) => isHoldable(c, input.date, rule))
    .sort(compareStarterOrder);
  const securedMinutes = holdable.reduce((sum, c) => sum + c.estimatedMinutes, 0);

  // Starter: take belege in §6 order until the cumulative effort reaches the target
  // (bridge the morning gap, not the whole day). When the target is 0 the starter is
  // empty; when the backlog is short the starter is the whole holdable pool.
  let starterMinutes = 0;
  let starterBelegCount = 0;
  for (const c of holdable) {
    if (targetMinutes > 0 && starterMinutes >= targetMinutes) break;
    starterMinutes += c.estimatedMinutes;
    starterBelegCount += 1;
  }

  // No early shift → target 0 is legitimate (nothing to bridge), but it is NOT a
  // satisfied reserve. Otherwise the backlog either meets the floor or is at risk.
  const state: ReserveState =
    earlyShiftWorkerCount === 0
      ? 'no_early_shift'
      : securedMinutes >= targetMinutes
        ? 'satisfied'
        : 'at_risk';

  return { state, targetMinutes, securedMinutes, starterBelegCount, starterMinutes };
}
