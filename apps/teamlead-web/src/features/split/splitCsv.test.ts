import { describe, expect, it } from 'vitest';
import { splitsToCsv } from './splitCsv.js';
import type { RecordedSplit } from './SplitProvider.js';

const SPLIT: RecordedSplit = {
  id: 'split-case-412-1',
  caseId: 'case-412',
  weBelegNo: 'WE-2026-000412',
  totalQuantity: 3000,
  effortPoints: 1382,
  estimatedMinutes: 1382,
  splitMode: 'quantity',
  captureMode: 'getrennt',
  reason: 'Großmenge Koffer',
  createdAt: '2026-06-24T12:00:00.000Z',
  isComplete: true,
  shares: [
    { employeeId: 'emp-ak', employeeName: 'A. Köhler', quantity: 1500, sharePct: 50, effortPoints: 691, estimatedMinutes: 691 },
    { employeeId: 'emp-mb', employeeName: 'M. Brandt', quantity: 1000, sharePct: 33.3, effortPoints: 460.67, estimatedMinutes: 460.67 },
    { employeeId: 'emp-lv', employeeName: 'L. Vogt', quantity: 500, sharePct: 16.7, effortPoints: 230.33, estimatedMinutes: 230.33 },
  ],
};

describe('splitsToCsv', () => {
  it('emits a header, one row per share, and a case_total aggregate row', () => {
    const csv = splitsToCsv([SPLIT]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('caseId;weBelegNo;employeeId');
    expect(lines).toHaveLength(1 + 3 + 1); // header + 3 shares + aggregate
    expect(lines[1]).toBe('case-412;WE-2026-000412;emp-ak;A. Köhler;getrennt;50;1500;691;share');
    expect(lines[lines.length - 1]).toContain('case_total');
    expect(lines[lines.length - 1]).toContain('3000;1382');
  });

  it('returns just the header for no splits', () => {
    expect(splitsToCsv([]).split('\n')).toHaveLength(1);
  });
});
