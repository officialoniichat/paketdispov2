import type { EmployeeShift, ISODateTime } from '@paket/domain-types';
import { DEFAULT_SHIFT_END_CONFIG, type ShiftEndConfig } from '../config.js';

/**
 * Schichtende-Steuerung (Teamlead-Feedback Punkte 5 + 6). Pure, deterministic helpers
 * that bound assignment by how close `now` is to a shift's `plannedEnd`. See
 * docs/concept/shift-end-handling-concept.md.
 *
 *  - {@link autoAssignableCapacityMinutes} (ZIEL A): the net capacity the BATCH
 *    auto-distribution may still place before the cutoff point
 *    (`plannedEnd − autoCutoffMinutes`). Both an end-of-shift buffer AND elapsed
 *    wall-clock shrink it, so the last ~2 h stay free for self-pull.
 *  - {@link finishableBudgetMinutes} (ZIEL B): a self-pull cart must also fit into the
 *    real wall-clock time left until `plannedEnd`, so nobody starts work that cannot be
 *    finished before the shift ends ("keine offenen Belege über Nacht").
 */

const MS_PER_MINUTE = 60_000;

/** Wall-clock minutes from `now` to the shift's `plannedEnd` (0 once past it). */
export function minutesUntilShiftEnd(shift: EmployeeShift, now: ISODateTime): number {
  const end = Date.parse(shift.plannedEnd);
  const nowMs = Date.parse(now);
  if (Number.isNaN(end) || Number.isNaN(nowMs)) return 0;
  return Math.max(0, (end - nowMs) / MS_PER_MINUTE);
}

/**
 * Net capacity (minutes) still auto-assignable to `shift` at wall-clock `now`, given the
 * `autoCutoffMinutes` reservation before `plannedEnd`. Proportional, wall-clock-aware:
 *
 *   fraction = clamp((cutoffPoint − max(now, plannedStart)) / fullWindow, 0, 1)
 *   effective = round(netCapacityMinutes × fraction)
 *
 * `autoCutoffMinutes = 0` (the engine default) is a no-op → `netCapacityMinutes`
 * unchanged, with no dependence on `now`. Inactive / zero-capacity shifts → 0.
 */
export function autoAssignableCapacityMinutes(
  shift: EmployeeShift,
  now: ISODateTime,
  config: ShiftEndConfig = DEFAULT_SHIFT_END_CONFIG,
): number {
  if (!shift.active || shift.netCapacityMinutes <= 0) return 0;
  if (config.autoCutoffMinutes <= 0) return shift.netCapacityMinutes;

  const start = Date.parse(shift.plannedStart);
  const end = Date.parse(shift.plannedEnd);
  const nowMs = Date.parse(now);
  // Without a usable window or now we cannot reason about the cutoff — fall back to the
  // full net capacity rather than silently starving the day.
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start || Number.isNaN(nowMs)) {
    return shift.netCapacityMinutes;
  }

  const fullWindowMin = (end - start) / MS_PER_MINUTE;
  const cutoffPointMs = end - config.autoCutoffMinutes * MS_PER_MINUTE;
  const fromMs = Math.max(nowMs, start);
  const assignableWindowMin = Math.max(0, (cutoffPointMs - fromMs) / MS_PER_MINUTE);
  const fraction = Math.min(1, assignableWindowMin / fullWindowMin);
  return Math.round(shift.netCapacityMinutes * fraction);
}

/**
 * Effort-minute budget for a self-pull cart (ZIEL B): the smaller of the worker's
 * remaining net capacity and the real wall-clock time left until `plannedEnd`. Sizing a
 * pulled cart to this budget keeps it finishable before the shift ends. 0 once the shift
 * is over.
 */
export function finishableBudgetMinutes(
  remainingCapacityMinutes: number,
  shift: EmployeeShift,
  now: ISODateTime,
): number {
  return Math.max(0, Math.min(remainingCapacityMinutes, minutesUntilShiftEnd(shift, now)));
}
