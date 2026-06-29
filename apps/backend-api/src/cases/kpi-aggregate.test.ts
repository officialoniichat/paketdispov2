import { describe, expect, it } from 'vitest';
import { aggregateKpiTotals, type KpiRecord } from './kpi-aggregate.js';

/** One worked hour (60 min) between start and completion. */
function record(partial: Partial<KpiRecord> & Pick<KpiRecord, 'measured'>): KpiRecord {
  return {
    completedQuantity: 60,
    effortPoints: 30,
    startedAt: new Date('2026-06-29T08:00:00.000Z'),
    completedAt: new Date('2026-06-29T09:00:00.000Z'),
    ...partial,
  };
}

describe('aggregateKpiTotals', () => {
  it('counts throughput for everyone but performance only for measured employees', () => {
    const totals = aggregateKpiTotals([
      record({ measured: true, completedQuantity: 100, effortPoints: 50 }),
      record({ measured: false, completedQuantity: 40, effortPoints: 99 }),
    ]);

    // Durchsatz: both contribute.
    expect(totals.completedParts).toBe(140);
    // Leistung: only the measured employee's effort/time count.
    expect(totals.effortPoints).toBe(50);
    expect(totals.workedMinutes).toBe(60);
  });

  it('excludes temp workers from per-hour productivity rates', () => {
    const measuredOnly = aggregateKpiTotals([
      record({ measured: true, completedQuantity: 120, effortPoints: 60 }),
    ]);
    const withTempAdded = aggregateKpiTotals([
      record({ measured: true, completedQuantity: 120, effortPoints: 60 }),
      // A slow temp worker: many minutes, few parts — would tank the rate if counted.
      record({
        measured: false,
        completedQuantity: 10,
        effortPoints: 5,
        startedAt: new Date('2026-06-29T08:00:00.000Z'),
        completedAt: new Date('2026-06-29T12:00:00.000Z'),
      }),
    ]);

    // Adding a temp worker must not change the measured productivity rates.
    expect(withTempAdded.partsPerHour).toBe(measuredOnly.partsPerHour);
    expect(withTempAdded.effortPointsPerHour).toBe(measuredOnly.effortPointsPerHour);
    expect(measuredOnly.partsPerHour).toBe(120);
    expect(measuredOnly.effortPointsPerHour).toBe(60);
  });

  it('returns zero rates when no measured worker logged time', () => {
    const totals = aggregateKpiTotals([
      record({ measured: false }),
      record({ measured: true, startedAt: null }),
    ]);

    expect(totals.completedParts).toBe(120);
    expect(totals.workedMinutes).toBe(0);
    expect(totals.partsPerHour).toBe(0);
    expect(totals.effortPointsPerHour).toBe(0);
  });

  it('handles an empty day', () => {
    expect(aggregateKpiTotals([])).toEqual({
      completedParts: 0,
      effortPoints: 0,
      workedMinutes: 0,
      partsPerHour: 0,
      effortPointsPerHour: 0,
    });
  });
});
