import type { KpiGranularity, KpiSnapshot, ISODateTime } from '@paket/domain-types';

/**
 * KPI computation (§15.2 Leistungsbewertung). Produces both headline rates – the
 * legacy "Teile/h" and the fairness-oriented "Aufwandspunkte/h" – plus operational
 * health metrics (Durchlaufzeit, Pool-Alter, Problemquote, Override-Quote).
 */

export interface KpiInput {
  granularity: KpiGranularity;
  subjectId?: string;
  periodStart: ISODateTime;
  periodEnd: ISODateTime;
  completedCases: number;
  completedParts: number;
  effortPoints: number;
  workedMinutes: number;
  /** Per completed case: minutes from `ready` to `completed` (Durchlaufzeit). */
  throughputMinutesSamples: readonly number[];
  /** Per still-open case: age in hours since it entered the pool (Pool-Alter). */
  poolAgeHoursSamples: readonly number[];
  /** Issues raised in the period (Problemquote numerator). */
  issueCount: number;
  /** Teamlead overrides in the period (Override-Quote numerator). */
  overrideCount: number;
  /** Assignments in the period (Override-Quote denominator). */
  assignmentCount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ratePerHour(value: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return round2(value / (minutes / 60));
}

function average(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  return round2(samples.reduce((sum, n) => sum + n, 0) / samples.length);
}

/** Bounded ratio in [0, 1]; a zero denominator yields 0 (no signal, not a failure). */
function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round2(Math.min(numerator / denominator, 1));
}

/** Compute a full KPI snapshot from period aggregates. */
export function computeKpiSnapshot(input: KpiInput): KpiSnapshot {
  return {
    granularity: input.granularity,
    subjectId: input.subjectId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    completedCases: input.completedCases,
    completedParts: input.completedParts,
    effortPoints: round2(input.effortPoints),
    workedMinutes: round2(input.workedMinutes),
    partsPerHour: ratePerHour(input.completedParts, input.workedMinutes),
    effortPointsPerHour: ratePerHour(input.effortPoints, input.workedMinutes),
    avgThroughputMinutes: average(input.throughputMinutesSamples),
    avgPoolAgeHours: average(input.poolAgeHoursSamples),
    problemRate: rate(input.issueCount, input.completedCases),
    overrideRate: rate(input.overrideCount, input.assignmentCount),
  };
}
