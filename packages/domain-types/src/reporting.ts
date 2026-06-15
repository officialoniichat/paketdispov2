import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema } from './primitives.js';
import { kpiGranularitySchema } from './enums.js';

/**
 * Reporting / KPI contract (§15). The MVP reproduces today's "Teile pro IST-Zeit"
 * figure and adds effort-point-based fairness metrics plus operational KPIs.
 * Personal KPIs stay role-restricted and audit-logged (§16.1/§16.2).
 */

/** A computed KPI rollup for one subject (employee/team/section/day). */
export const kpiSnapshotSchema = z.object({
  granularity: kpiGranularitySchema,
  /** employeeId / sectionCode / team key; absent for a whole-day rollup. */
  subjectId: z.string().optional(),
  periodStart: isoDateTimeSchema,
  periodEnd: isoDateTimeSchema,

  // Throughput
  completedCases: z.number().int().nonnegative(),
  completedParts: z.number().int().nonnegative(),
  effortPoints: z.number().nonnegative(),
  workedMinutes: z.number().nonnegative(),

  // Performance (the two headline rates – §15.2)
  partsPerHour: z.number().nonnegative(),
  effortPointsPerHour: z.number().nonnegative(),

  // Operational health
  avgThroughputMinutes: z.number().nonnegative(), // Durchlaufzeit ready->completed
  avgPoolAgeHours: z.number().nonnegative(), // Pool-Alter of still-open cases
  problemRate: z.number().min(0).max(1), // Problemquote: issues / cases
  overrideRate: z.number().min(0).max(1), // Override-Quote: teamlead overrides / assignments
});
export type KpiSnapshot = z.infer<typeof kpiSnapshotSchema>;

/** Flattened ZST export row consumed by BI / CSV (§15.1, §15 CSV/BI-Export). */
export const zstExportRowSchema = z.object({
  zstId: idSchema,
  caseId: idSchema,
  weBelegNo: z.string(),
  employeeId: idSchema,
  bookingDate: isoDateSchema,
  completedQuantity: z.number().int().nonnegative(),
  effortPoints: z.number().nonnegative(),
  processingMinutes: z.number().nonnegative(),
  source: z.string(),
  completedAt: isoDateTimeSchema,
});
export type ZstExportRow = z.infer<typeof zstExportRowSchema>;
