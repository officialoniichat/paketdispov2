/**
 * CSV projection of manual splits — one row per employee share plus an aggregate
 * `case_total` row per Beleg (mirrors the export in the UX mockup #3). This is a
 * planned-split export (pre-ZST); the authoritative ZST/CSV with measured
 * completion is produced by the backend later (deferred).
 */
import type { RecordedSplit } from './SplitProvider.js';

const HEADER =
  'caseId;weBelegNo;employeeId;employeeName;captureMode;sharePct;plannedQty;plannedEffortPoints;rowType';

function row(values: (string | number)[]): string {
  return values.join(';');
}

/** Render the committed splits as a semicolon-separated CSV string. */
export function splitsToCsv(splits: readonly RecordedSplit[]): string {
  const lines: string[] = [HEADER];
  for (const split of splits) {
    for (const share of split.shares) {
      lines.push(
        row([
          split.caseId,
          split.weBelegNo,
          share.employeeId,
          share.employeeName,
          split.captureMode,
          share.sharePct,
          share.quantity,
          share.effortPoints,
          'share',
        ]),
      );
    }
    lines.push(
      row([
        split.caseId,
        split.weBelegNo,
        '—',
        'Beleg gesamt',
        'aggregate',
        100,
        split.totalQuantity,
        split.effortPoints,
        'case_total',
      ]),
    );
  }
  return lines.join('\n');
}
