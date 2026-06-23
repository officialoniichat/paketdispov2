import { describe, expect, it } from 'vitest';
import { buildCollectStops } from './collectStops.js';

describe('buildCollectStops with engine route stops', () => {
  const cases = [
    { caseId: 'c1', storageLocationCode: 'R27' },
    { caseId: 'c2', storageLocationCode: 'R27' },
    { caseId: 'c3', storageLocationCode: 'A-4' },
  ];

  it('keeps the engine route order and attaches the Belege at each location', () => {
    const routeStops = [
      { sequence: 0, locationCode: 'R27', scanRequired: false },
      { sequence: 1, locationCode: 'A-4', scanRequired: true },
    ];
    const stops = buildCollectStops(routeStops, cases);
    expect(stops.map((s) => s.locationCode)).toEqual(['R27', 'A-4']);
    expect(stops[0]).toMatchObject({ sequence: 0, scanRequired: false, caseIds: ['c1', 'c2'] });
    expect(stops[1]).toMatchObject({ sequence: 1, scanRequired: true, caseIds: ['c3'] });
  });
});

describe('buildCollectStops fallback (no route stops)', () => {
  it('groups cases by location and orders them numerically (§D.3-like)', () => {
    const cases = [
      { caseId: 'c1', storageLocationCode: 'R27' },
      { caseId: 'c2', storageLocationCode: 'R3' },
      { caseId: 'c3', storageLocationCode: 'R27' },
    ];
    const stops = buildCollectStops([], cases);
    expect(stops.map((s) => s.locationCode)).toEqual(['R3', 'R27']);
    expect(stops.map((s) => s.sequence)).toEqual([0, 1]);
    expect(stops.every((s) => s.scanRequired === false)).toBe(true);
    expect(stops[1]?.caseIds).toEqual(['c1', 'c3']);
  });

  it('returns no stops when there are no cases', () => {
    expect(buildCollectStops([], [])).toEqual([]);
  });
});
