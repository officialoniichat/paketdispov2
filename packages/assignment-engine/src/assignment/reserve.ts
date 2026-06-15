import type {
  EmployeeShift,
  GoodsReceiptCase,
  PriorityFlag,
  SectionCode,
} from '@paket/domain-types';
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
 * Sections that are never eligible for the eiserne Reserve (concept §5.1): NOS(4),
 * Extrabestellung(7) and NOS-Nachorder(8) are everyday/urgent ware that must be
 * worked the same day, so they are never deliberately held back overnight.
 */
const NEVER_RESERVE_SECTIONS: ReadonlySet<SectionCode> = new Set<SectionCode>([4, 7, 8]);

/**
 * Priority flags that disqualify a case from being held back (concept §5.1). These
 * mirror `overrideAllowedFor` — anything that may *consume* the reserve must never
 * *be* the reserve.
 */
const NEVER_RESERVE_FLAGS: ReadonlySet<PriorityFlag> = new Set<PriorityFlag>([
  'prio',
  'catman_due',
  'overdue',
  'manual_teamlead_priority',
]);

export interface ReserveStatusInput {
  /** Current ready pool (carryover candidates for tomorrow's morning). */
  cases: GoodsReceiptCase[];
  /**
   * Active shifts for the planning date. Used as a proxy for the early-shift worker
   * count (concept §5: no PEP yet → today's active-shift count is the proxy; the
   * assumption is that each active worker needs `morningGapMinutes` of startable
   * carryover to bridge the morning gap).
   */
  shifts: EmployeeShift[];
  /** Planning date (YYYY-MM-DD) the reserve is being sized for. */
  date: string;
  config?: ReserveConfig;
}

/**
 * Pure, deadline-aware view of the eiserne Reserve + tomorrow's Starterpaket
 * (concept §5/§6). Reports the target floor, the holdable backlog that can secure
 * it, whether it is satisfied, and the belege/minutes that would form the morning
 * starter — without mutating the pool or selecting an assignment.
 */
export interface ReserveStatus {
  /** R = earlyShiftWorkerCount × morningGapMinutes (concept §5). */
  targetMinutes: number;
  /** Raw sum of holdable, deadline-safe `ready` backlog minutes. */
  securedMinutes: number;
  /** Whether the holdable backlog meets the target floor. */
  satisfied: boolean;
  /** Belege that would form tomorrow's starter (capped at the target worth). */
  starterBelegCount: number;
  /** Σ estimatedMinutes of those starter belege. */
  starterMinutes: number;
}

/**
 * A case is holdable into the next morning (concept §5.1/§5.3) when it is a `ready`
 * carryover candidate that is neither everyday/urgent by section nor flagged urgent,
 * and holding it overnight does not breach its Catmandatum/Verladetag.
 */
function isHoldable(c: GoodsReceiptCase, date: string): boolean {
  if (c.status !== 'ready') return false;
  if (c.section !== null && NEVER_RESERVE_SECTIONS.has(c.section)) return false;
  if (c.priorityFlags.some((flag) => NEVER_RESERVE_FLAGS.has(flag))) return false;
  // Deadline-safe: holding overnight is only safe if both deadlines are strictly
  // after the planning date (a same-day/next-cycle deadline must be worked now).
  if (c.catManDate !== undefined && c.catManDate <= date) return false;
  if (c.loadPlanDate !== undefined && c.loadPlanDate <= date) return false;
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
  const config = input.config ?? DEFAULT_RESERVE_CONFIG;
  const earlyShiftWorkerCount = input.shifts.length;
  const targetMinutes = earlyShiftWorkerCount * config.morningGapMinutes;

  const holdable = input.cases
    .filter((c) => isHoldable(c, input.date))
    .sort(compareStarterOrder);

  const securedMinutes = holdable.reduce((sum, c) => sum + c.estimatedMinutes, 0);
  const satisfied = securedMinutes >= targetMinutes;

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

  return { targetMinutes, securedMinutes, satisfied, starterBelegCount, starterMinutes };
}
