import { describe, expect, it } from 'vitest';
import type { KpiSnapshot, ZstExportRow } from '@paket/domain-types';
import { computeKpiSnapshot, type KpiInput } from './kpis.js';
import { kpiSnapshotsToCsv, toCsv, zstRowsToCsv } from './csv-export.js';

function kpiInput(overrides: Partial<KpiInput> = {}): KpiInput {
  return {
    granularity: 'employee',
    subjectId: 'emp-1',
    periodStart: '2026-06-15T06:00:00.000Z',
    periodEnd: '2026-06-15T14:00:00.000Z',
    completedCases: 10,
    completedParts: 480,
    effortPoints: 240,
    workedMinutes: 480,
    throughputMinutesSamples: [30, 50, 40],
    poolAgeHoursSamples: [2, 4],
    issueCount: 2,
    overrideCount: 1,
    assignmentCount: 5,
    ...overrides,
  };
}

describe('computeKpiSnapshot (§15.2)', () => {
  it('computes Teile/h and Aufwandspunkte/h side by side', () => {
    const k = computeKpiSnapshot(kpiInput());
    expect(k.partsPerHour).toBe(60); // 480 parts / 8 h
    expect(k.effortPointsPerHour).toBe(30); // 240 AP / 8 h
  });

  it('averages Durchlaufzeit and Pool-Alter', () => {
    const k = computeKpiSnapshot(kpiInput());
    expect(k.avgThroughputMinutes).toBe(40);
    expect(k.avgPoolAgeHours).toBe(3);
  });

  it('bounds Problemquote and Override-Quote into [0,1]', () => {
    const k = computeKpiSnapshot(kpiInput({ issueCount: 2, completedCases: 10 }));
    expect(k.problemRate).toBe(0.2);
    expect(k.overrideRate).toBe(0.2);
    const capped = computeKpiSnapshot(kpiInput({ overrideCount: 99, assignmentCount: 5 }));
    expect(capped.overrideRate).toBe(1);
  });

  it('yields 0 rates when denominators are zero (no worked minutes / no cases)', () => {
    const k = computeKpiSnapshot(
      kpiInput({
        workedMinutes: 0,
        completedCases: 0,
        assignmentCount: 0,
        throughputMinutesSamples: [],
        poolAgeHoursSamples: [],
      }),
    );
    expect(k.partsPerHour).toBe(0);
    expect(k.effortPointsPerHour).toBe(0);
    expect(k.problemRate).toBe(0);
    expect(k.overrideRate).toBe(0);
    expect(k.avgThroughputMinutes).toBe(0);
  });
});

describe('CSV export (§15 CSV/BI-Export)', () => {
  it('escapes commas, quotes and newlines per RFC 4180', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['plain', 'has,comma'],
        ['has"quote', 'line\nbreak'],
      ],
    );
    expect(csv).toBe('a,b\r\nplain,"has,comma"\r\n"has""quote","line\nbreak"');
  });

  it('serialises ZST rows with a stable header', () => {
    const rows: ZstExportRow[] = [
      {
        zstId: 'zst-1',
        caseId: 'case-1',
        weBelegNo: 'WE-1',
        employeeId: 'emp-1',
        bookingDate: '2026-06-15',
        completedQuantity: 100,
        effortPoints: 40,
        processingMinutes: 90,
        source: 'mobile_app',
        completedAt: '2026-06-15T09:30:00.000Z',
      },
    ];
    const csv = zstRowsToCsv(rows);
    const [header, line] = csv.split('\r\n');
    expect(header.split(',')[0]).toBe('zstId');
    expect(line).toContain('WE-1');
    expect(line).toContain('40');
  });

  it('serialises KPI snapshots for BI', () => {
    const snap: KpiSnapshot = computeKpiSnapshot(kpiInput());
    const csv = kpiSnapshotsToCsv([snap]);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('partsPerHour');
  });

  it('emits header-only CSV for an empty export', () => {
    expect(zstRowsToCsv([]).includes('\r\n')).toBe(false);
  });
});
