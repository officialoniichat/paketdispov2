/**
 * §10.1 ZST/KPI aggregation — single source of the "Durchsatz zählt alle, Leistung nur
 * gemessene" rule for temporary workers (Azubis/Saisonaushilfen). See
 * docs/concept/temporary-workers-concept.md.
 *
 * Throughput (parts completed) stays fully visible so the day's progress is complete.
 * Performance/productivity (effort, worked time, per-hour rates) counts only employees
 * with `measured: true`, so temp workers cannot distort per-head productivity.
 */

/** One ZST record as the aggregation needs it (subset of the persisted row). */
export interface KpiRecord {
  completedQuantity: number;
  effortPoints: number;
  /** Null when the worker never started a timer for this record (contributes 0 minutes). */
  startedAt: Date | null;
  completedAt: Date;
  /** Whether the record's employee is performance-measured. Temp/Aushilfe = false. */
  measured: boolean;
}

/** Aggregated KPI numbers derived from the day's ZST records. */
export interface KpiTotals {
  /** Throughput: parts completed by everyone (incl. temp workers). */
  completedParts: number;
  /** Performance: effort points of measured employees only. */
  effortPoints: number;
  /** Performance: worked minutes of measured employees only. */
  workedMinutes: number;
  /** Productivity: parts/hour of measured employees only. */
  partsPerHour: number;
  /** Productivity: effort points/hour of measured employees only. */
  effortPointsPerHour: number;
}

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

/**
 * Aggregate the day's ZST records into the KPI tile numbers. Throughput counts all
 * records; performance/productivity counts measured employees only.
 */
export function aggregateKpiTotals(records: readonly KpiRecord[]): KpiTotals {
  let completedParts = 0;
  let measuredParts = 0;
  let effortPoints = 0;
  let workedMinutes = 0;

  for (const record of records) {
    completedParts += record.completedQuantity;
    if (!record.measured) continue;
    measuredParts += record.completedQuantity;
    effortPoints += record.effortPoints;
    if (record.startedAt) {
      workedMinutes += (record.completedAt.getTime() - record.startedAt.getTime()) / MS_PER_MINUTE;
    }
  }

  const hours = workedMinutes / MINUTES_PER_HOUR;
  const partsPerHour = hours === 0 ? 0 : Math.round(measuredParts / hours);
  const effortPointsPerHour = hours === 0 ? 0 : Math.round(effortPoints / hours);

  return {
    completedParts,
    effortPoints,
    workedMinutes: Math.round(workedMinutes),
    partsPerHour,
    effortPointsPerHour,
  };
}
