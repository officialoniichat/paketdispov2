import type { KpiSnapshot, ZstExportRow } from '@paket/domain-types';

/**
 * CSV / BI export (§15 CSV/BI-Export). Emits RFC-4180-quoted comma CSV that BI tooling
 * can ingest directly. In the MVP the ZST is delivered as an export file/printjob; a
 * deep ZST-system integration is Phase 2 (Anhang H).
 */

/** Escape one CSV field per RFC 4180 (quote when it contains comma, quote or newline). */
function csvField(value: string | number | undefined): string {
  if (value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Render a CSV document from a header row and record rows (CRLF line endings). */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | undefined)[])[],
): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvField).join(','));
  }
  return lines.join('\r\n');
}

const ZST_HEADERS = [
  'zstId',
  'caseId',
  'weBelegNo',
  'employeeId',
  'bookingDate',
  'completedQuantity',
  'effortPoints',
  'processingMinutes',
  'source',
  'completedAt',
] as const;

/** Serialise ZST export rows to CSV (§15.1). */
export function zstRowsToCsv(rows: readonly ZstExportRow[]): string {
  return toCsv(
    ZST_HEADERS,
    rows.map((r) => [
      r.zstId,
      r.caseId,
      r.weBelegNo,
      r.employeeId,
      r.bookingDate,
      r.completedQuantity,
      r.effortPoints,
      r.processingMinutes,
      r.source,
      r.completedAt,
    ]),
  );
}

const KPI_HEADERS = [
  'granularity',
  'subjectId',
  'periodStart',
  'periodEnd',
  'completedCases',
  'completedParts',
  'effortPoints',
  'workedMinutes',
  'partsPerHour',
  'effortPointsPerHour',
  'avgThroughputMinutes',
  'avgPoolAgeHours',
  'problemRate',
  'overrideRate',
] as const;

/** Serialise KPI snapshots to CSV for BI dashboards (§15.2). */
export function kpiSnapshotsToCsv(snapshots: readonly KpiSnapshot[]): string {
  return toCsv(
    KPI_HEADERS,
    snapshots.map((s) => [
      s.granularity,
      s.subjectId,
      s.periodStart,
      s.periodEnd,
      s.completedCases,
      s.completedParts,
      s.effortPoints,
      s.workedMinutes,
      s.partsPerHour,
      s.effortPointsPerHour,
      s.avgThroughputMinutes,
      s.avgPoolAgeHours,
      s.problemRate,
      s.overrideRate,
    ]),
  );
}
