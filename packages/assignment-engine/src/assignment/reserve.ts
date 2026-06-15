import type { PriorityFlag } from '@paket/domain-types';
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
