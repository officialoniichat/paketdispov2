import { describe, expect, it } from 'vitest';
import { parseShiftImportCsv } from './shift-import.js';
import { computeNetCapacityMinutes, teamCapacityMinutes, toEmployeeShift } from './net-capacity.js';

// Synthetic SEAK/PEP export (discovery doc 04, §2) — NOT real data.
const SAMPLE_CSV = [
  'employeeNo;date;plannedStart;plannedEnd;breakMinutes;plannedHours;workstationCode;active',
  'E-0001;2026-06-16;2026-06-16T06:00:00+02:00;2026-06-16T14:30:00+02:00;30;8.0;AP-1;true',
  'E-0002;2026-06-16;2026-06-16T06:00:00+02:00;2026-06-16T14:30:00+02:00;30;8.0;;true',
  'E-0003;2026-06-16;2026-06-16T09:00:00+02:00;2026-06-16T13:00:00+02:00;0;4.0;AP-2;true',
  'E-0004;2026-06-16;;;;;;false',
].join('\n');

describe('parseShiftImportCsv (§13.2)', () => {
  it('parses the three active rows and records the absence as info', () => {
    const result = parseShiftImportCsv(SAMPLE_CSV);
    expect(result.rows.map((r) => r.employeeNo)).toEqual(['E-0001', 'E-0002', 'E-0003']);
    const absence = result.warnings.find((w) => w.employeeNo === 'E-0004');
    expect(absence?.severity).toBe('info');
  });

  it('keeps optional workstationCode absent when the column is empty', () => {
    const { rows } = parseShiftImportCsv(SAMPLE_CSV);
    expect(rows.find((r) => r.employeeNo === 'E-0001')?.workstationCode).toBe('AP-1');
    expect(rows.find((r) => r.employeeNo === 'E-0002')?.workstationCode).toBeUndefined();
  });

  it('matches columns by header name regardless of order', () => {
    const reordered = [
      'active;employeeNo;plannedHours;date;plannedStart;plannedEnd;breakMinutes;workstationCode',
      'true;E-9;8.0;2026-06-16;2026-06-16T06:00:00+02:00;2026-06-16T14:30:00+02:00;30;AP-9',
    ].join('\n');
    const { rows } = parseShiftImportCsv(reordered);
    expect(rows[0]?.employeeNo).toBe('E-9');
    expect(rows[0]?.active).toBe(true);
  });

  it('warns and skips a row whose end is not after its start (no hard abort)', () => {
    const csv = [
      'employeeNo;date;plannedStart;plannedEnd;breakMinutes;plannedHours;workstationCode;active',
      'E-1;2026-06-16;2026-06-16T14:00:00+02:00;2026-06-16T06:00:00+02:00;0;0;;true',
      'E-2;2026-06-16;2026-06-16T06:00:00+02:00;2026-06-16T14:00:00+02:00;30;7.5;;true',
    ].join('\n');
    const { rows, warnings } = parseShiftImportCsv(csv);
    expect(rows.map((r) => r.employeeNo)).toEqual(['E-2']);
    expect(warnings.some((w) => w.employeeNo === 'E-1')).toBe(true);
  });

  it('warns on unknown employeeNo but still imports the row', () => {
    const { rows, warnings } = parseShiftImportCsv(SAMPLE_CSV, {
      knownEmployeeNos: new Set(['E-0001']),
    });
    expect(rows).toHaveLength(3);
    expect(warnings.filter((w) => w.message.includes('unknown'))).toHaveLength(2);
  });
});

describe('net capacity (§4.3)', () => {
  it('computes window minus break for a full shift', () => {
    const { rows } = parseShiftImportCsv(SAMPLE_CSV);
    const e1 = rows.find((r) => r.employeeNo === 'E-0001')!;
    // 06:00–14:30 = 510 min, minus 30 break = 480
    expect(computeNetCapacityMinutes(e1)).toBe(480);
  });

  it('applies the productivity factor', () => {
    const { rows } = parseShiftImportCsv(SAMPLE_CSV);
    const e1 = rows.find((r) => r.employeeNo === 'E-0001')!;
    expect(
      computeNetCapacityMinutes(e1, { productivityFactor: 0.9, morningCapacityFraction: 0.5 }),
    ).toBe(432);
  });

  it('builds an EmployeeShift and sums team capacity', () => {
    const { rows } = parseShiftImportCsv(SAMPLE_CSV);
    const shifts = rows.map((r) => toEmployeeShift(r));
    // E-0001: 480, E-0002: 480, E-0003: 09–13 = 240, break 0 → 240
    expect(shifts.map((s) => s.netCapacityMinutes)).toEqual([480, 480, 240]);
    expect(teamCapacityMinutes(shifts)).toBe(1200);
    expect(shifts[0]?.employeeId).toBe('E-0001');
  });

  it('lets a per-head productivity factor override the config factor', () => {
    const { rows } = parseShiftImportCsv(SAMPLE_CSV);
    const e1 = rows.find((r) => r.employeeNo === 'E-0001')!;
    // 480 net min × 0.5 per-head factor = 240, ignoring the default config 1.0.
    expect(computeNetCapacityMinutes(e1, undefined, 0.5)).toBe(240);
  });

  it('applies the per-head factor when deriving the built shift capacity', () => {
    const { rows } = parseShiftImportCsv(SAMPLE_CSV);
    const e1 = rows.find((r) => r.employeeNo === 'E-0001')!;
    const shift = toEmployeeShift(e1, {
      resolveProductivityFactor: (no) => (no === 'E-0001' ? 0.8 : undefined),
    });
    expect(shift.netCapacityMinutes).toBe(384); // 480 × 0.8
  });
});
