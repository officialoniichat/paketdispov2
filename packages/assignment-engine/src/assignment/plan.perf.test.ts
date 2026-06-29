import { describe, expect, it } from 'vitest';
import {
  employeeShiftSchema,
  goodsReceiptCaseSchema,
  type EmployeeShift,
  type GoodsReceiptCase,
  type LocationMaster,
} from '@paket/domain-types';
import { assignWork } from './plan.js';
import { DEFAULT_ENGINE_CONFIG } from '../config.js';
import type { EngineInput } from '../types.js';

// Anhang E.5: a full recalculate must stay well under 5 s. The realistic peak
// day is ~315 ready Belege (docs/data/belege-history-per-day.csv → max 315) over
// a ~12-head team. This guards that the deterministic engine still plans that
// volume comfortably inside the budget — and that two runs are byte-identical.

const DATE = '2026-06-16';
const NOW = '2026-06-16T06:30:00+02:00';

// Location master spread across all three Bereiche (Regal / Palette / Hängebahn),
// mirroring the dev seed so the bereich-routing path is exercised at scale.
// `type` is the coarse storageLocation enum on the case; `kind` is the fine
// LocationKind on the LocationMaster (palette_a/b/c → coarse 'palette').
const KINDS = [
  ...Array.from({ length: 14 }, (_, i) => ({ code: `R${(i + 1) * 2 + 1}`, type: 'regal' as const, kind: 'regal' as const })),
  { code: 'PA-1', type: 'palette' as const, kind: 'palette_a' as const },
  { code: 'PB-4', type: 'palette' as const, kind: 'palette_b' as const },
  { code: 'PC-2', type: 'palette' as const, kind: 'palette_c' as const },
  { code: 'HB-5/234', type: 'haengebahn' as const, kind: 'haengebahn' as const },
  { code: 'HB-6/118', type: 'haengebahn' as const, kind: 'haengebahn' as const },
  { code: 'D-3', type: 'lagerplatz_d' as const, kind: 'lagerplatz_d' as const },
];

const LOCATIONS: LocationMaster[] = KINDS.map((k, i) => ({
  id: `loc-${i}`,
  code: k.code,
  displayName: k.code,
  kind: k.kind,
  active: true,
  sequenceIndex: i,
}));

function makeCase(index: number): GoodsReceiptCase {
  const loc = KINDS[index % KINDS.length]!;
  // Consecutive weBelegNo within blocks of 4 → exercises delivery grouping too.
  const weNum = 3_540_000 + index + Math.floor(index / 4) * 7;
  const qty = 10 + ((index * 13) % 180);
  const minutes = 8 + ((index * 7) % 50);
  return goodsReceiptCaseSchema.parse({
    id: `case-${index}`,
    source: 'prohandel_api',
    externalRef: `WE-${weNum}`,
    weBelegNo: `WE-${weNum}`,
    deliveryNoteNo: `LS-${Math.floor(index / 4)}`,
    bookingDate: DATE,
    branchNo: '001',
    storageLocation: { id: `loc-${index}`, type: loc.type, code: loc.code, active: true },
    section: index % 5 === 0 ? null : ([1, 2, 3, 4, 7, 8] as const)[index % 6],
    priorityFlags: index % 17 === 0 ? ['prio'] : [],
    totalQuantity: qty,
    status: 'ready',
    effortPoints: Math.round(minutes / 2.2),
    estimatedMinutes: minutes,
    version: 0,
  });
}

function shift(employeeId: string, capacity: number): EmployeeShift {
  return employeeShiftSchema.parse({
    id: `shift-${employeeId}`,
    employeeId,
    date: DATE,
    plannedStart: '2026-06-16T06:00:00+02:00',
    plannedEnd: '2026-06-16T14:30:00+02:00',
    breakMinutes: 30,
    plannedHours: 8,
    netCapacityMinutes: capacity,
    active: true,
  });
}

function peakInput(caseCount: number): EngineInput {
  return {
    date: DATE,
    cases: Array.from({ length: caseCount }, (_, i) => makeCase(i)),
    shifts: Array.from({ length: 12 }, (_, i) => shift(`E-${i + 1}`, 450)),
    locations: LOCATIONS,
    nextMorningCapacityMinutes: 5000,
  };
}

describe('assignWork performance (Anhang E.5 < 5 s)', () => {
  it('plans a ~315-case peak day well under the 5 s budget', () => {
    const input = peakInput(315);
    const start = performance.now();
    const plan = assignWork(input, DEFAULT_ENGINE_CONFIG, { now: NOW });
    const elapsedMs = performance.now() - start;

    expect(plan.bundles.length).toBeGreaterThan(0);
    // Generous CI-safe ceiling; in practice this runs in a few ms.
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('is deterministic: two runs of the same peak input are identical', () => {
    const input = peakInput(315);
    const a = assignWork(input, DEFAULT_ENGINE_CONFIG, { now: NOW });
    const b = assignWork(input, DEFAULT_ENGINE_CONFIG, { now: NOW });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
