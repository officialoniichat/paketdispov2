import { employeeShiftSchema, type EmployeeShift, type ShiftImportRow } from '@paket/domain-types';
import { DEFAULT_CAPACITY_CONFIG, type CapacityConfig } from '../config.js';

/**
 * Net capacity derivation (§4.3 step 2). The "geplante IST-Stunden vs. Brutto/Netto"
 * definition is an open point (discovery #63); we use the recorded shift window minus
 * the recorded pause, scaled by a configurable productivity factor (default 1.0), and
 * cross-check against plannedHours only for diagnostics. Inactive shifts contribute 0.
 */

export interface NetCapacityOptions {
  config?: CapacityConfig;
  /** Map SEAK `employeeNo` → internal employee id (open point #59); defaults to identity. */
  resolveEmployeeId?: (employeeNo: string) => string;
  /** Map `workstationCode` → workstation location id; defaults to undefined. */
  resolveWorkstationId?: (workstationCode: string) => string | undefined;
}

function shiftWindowMinutes(row: ShiftImportRow): number {
  const startMs = Date.parse(row.plannedStart);
  const endMs = Date.parse(row.plannedEnd);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, (endMs - startMs) / 60000);
}

/** Net belegbearbeitung capacity in minutes for one shift row. Inactive → 0. */
export function computeNetCapacityMinutes(
  row: ShiftImportRow,
  config: CapacityConfig = DEFAULT_CAPACITY_CONFIG,
): number {
  if (!row.active) return 0;
  const net = Math.max(0, shiftWindowMinutes(row) - row.breakMinutes);
  return Math.round(net * config.productivityFactor);
}

/** Convert a validated import row into a persisted {@link EmployeeShift} with net capacity. */
export function toEmployeeShift(
  row: ShiftImportRow,
  options: NetCapacityOptions = {},
): EmployeeShift {
  const config = options.config ?? DEFAULT_CAPACITY_CONFIG;
  const employeeId = options.resolveEmployeeId?.(row.employeeNo) ?? row.employeeNo;
  const workstationId = row.workstationCode
    ? options.resolveWorkstationId?.(row.workstationCode)
    : undefined;

  return employeeShiftSchema.parse({
    id: `shift-${employeeId}-${row.date}`,
    employeeId,
    date: row.date,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    breakMinutes: row.breakMinutes,
    plannedHours: row.plannedHours,
    netCapacityMinutes: computeNetCapacityMinutes(row, config),
    workstationId,
    active: row.active,
  });
}

/** Total planned team capacity for a set of shifts (§4.3). */
export function teamCapacityMinutes(shifts: readonly EmployeeShift[]): number {
  return shifts.reduce((sum, shift) => sum + (shift.active ? shift.netCapacityMinutes : 0), 0);
}
