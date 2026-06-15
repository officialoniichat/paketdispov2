import { shiftImportRowSchema, type ShiftImportRow } from '@paket/domain-types';

/**
 * SEAK/PEP CSV import (§13.2). The real export format is not yet verified (discovery
 * doc 04, H.2); this parser implements the Soll-Schema: `;`-separated, UTF-8, with a
 * header row. Columns are matched by header name, so column order may vary.
 *
 * Robustness rule (discovery §4): a single bad/absent row never aborts the whole
 * import — it is skipped with a warning so the rest of the day can still be planned.
 */

export interface ShiftImportWarning {
  /** 1-based line number within the data rows (header excluded). */
  line: number;
  employeeNo?: string;
  message: string;
  severity: 'warning' | 'info';
}

export interface ShiftImportResult {
  rows: ShiftImportRow[];
  warnings: ShiftImportWarning[];
}

export interface ShiftImportOptions {
  delimiter?: string;
  /** Optional employee master; unknown ids warn but are NOT rejected (§4 robustness). */
  knownEmployeeNos?: ReadonlySet<string>;
}

const REQUIRED_HEADERS = [
  'employeeNo',
  'date',
  'plannedStart',
  'plannedEnd',
  'breakMinutes',
  'plannedHours',
  'active',
] as const;

function parseBool(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

function splitLines(csv: string): string[] {
  return csv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);
}

function headerIndex(headerCells: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerCells.forEach((cell, idx) => map.set(cell.trim(), idx));
  return map;
}

/** Parse a SEAK/PEP CSV export into validated {@link ShiftImportRow}s plus warnings. */
export function parseShiftImportCsv(
  csv: string,
  options: ShiftImportOptions = {},
): ShiftImportResult {
  const delimiter = options.delimiter ?? ';';
  const lines = splitLines(csv);
  const warnings: ShiftImportWarning[] = [];
  const rows: ShiftImportRow[] = [];

  if (lines.length === 0) {
    return { rows, warnings: [{ line: 0, message: 'empty CSV', severity: 'warning' }] };
  }

  const header = headerIndex(lines[0]!.split(delimiter));
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !header.has(h));
  if (missingHeaders.length > 0) {
    return {
      rows,
      warnings: [
        {
          line: 0,
          message: `missing header columns: ${missingHeaders.join(', ')}`,
          severity: 'warning',
        },
      ],
    };
  }

  const cellAt = (cells: string[], name: string): string => (cells[header.get(name)!] ?? '').trim();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(delimiter);
    const line = i; // 1-based data line
    const employeeNo = cellAt(cells, 'employeeNo');
    const active = parseBool(cellAt(cells, 'active'));
    const plannedStart = cellAt(cells, 'plannedStart');
    const plannedEnd = cellAt(cells, 'plannedEnd');

    if (plannedStart === '' || plannedEnd === '') {
      warnings.push({
        line,
        employeeNo: employeeNo || undefined,
        message: active ? 'active row without shift times — skipped' : 'absence row (active=false)',
        severity: active ? 'warning' : 'info',
      });
      continue;
    }

    const candidate = {
      employeeNo,
      date: cellAt(cells, 'date'),
      plannedStart,
      plannedEnd,
      breakMinutes: Number(cellAt(cells, 'breakMinutes')),
      plannedHours: Number(cellAt(cells, 'plannedHours')),
      workstationCode: cellAt(cells, 'workstationCode') || undefined,
      active,
    };

    const parsed = shiftImportRowSchema.safeParse(candidate);
    if (!parsed.success) {
      warnings.push({
        line,
        employeeNo: employeeNo || undefined,
        message: `invalid row: ${parsed.error.issues.map((e) => e.message).join('; ')}`,
        severity: 'warning',
      });
      continue;
    }

    const row = parsed.data;
    const startMs = Date.parse(row.plannedStart);
    const endMs = Date.parse(row.plannedEnd);
    if (endMs <= startMs) {
      warnings.push({
        line,
        employeeNo,
        message: 'plannedEnd not after plannedStart — skipped',
        severity: 'warning',
      });
      continue;
    }
    const shiftMinutes = (endMs - startMs) / 60000;
    if (row.breakMinutes >= shiftMinutes) {
      warnings.push({
        line,
        employeeNo,
        message: 'breakMinutes >= shift duration — skipped',
        severity: 'warning',
      });
      continue;
    }
    if (options.knownEmployeeNos && !options.knownEmployeeNos.has(row.employeeNo)) {
      warnings.push({
        line,
        employeeNo,
        message: `unknown employeeNo "${row.employeeNo}"`,
        severity: 'warning',
      });
    }

    rows.push(row);
  }

  return { rows, warnings };
}
