import { describe, expect, it } from 'vitest';
import { deriveStops, orderCasesForDisplay } from './BundleHomeScreen.js';

function stop(id: string, sequence: number, locationCode: string, scanned = false) {
  return { id, sequence, locationCode, scanRequired: false, scanned };
}

function kase(id: string, storageLocationCode: string) {
  return { id, storageLocationCode } as Parameters<typeof deriveStops>[1][number];
}

describe('deriveStops', () => {
  it('ein Container je Beleg, geordnet nach der Routen-Sequenz des Lagerplatzes', () => {
    const stops = deriveStops(
      [stop('s2', 1, 'B-2'), stop('s1', 0, 'A-1')],
      [kase('c2', 'B-2'), kase('c1', 'A-1')],
    );
    expect(stops.map((s) => s.id)).toEqual(['c1', 'c2']);
    expect(stops.map((s) => s.locationCode)).toEqual(['A-1', 'B-2']);
    expect(stops.map((s) => s.caseIds)).toEqual([['c1'], ['c2']]);
  });

  it('mehrere Belege am SELBEN Lagerplatz bleiben Einzelcontainer in Bündel-Reihenfolge (z. B. eine Lieferung)', () => {
    const stops = deriveStops(
      [stop('s1', 0, 'A-1')],
      [kase('c1', 'A-1'), kase('c2', 'A-1'), kase('c3', 'A-1')],
    );
    expect(stops.map((s) => s.id)).toEqual(['c1', 'c2', 'c3']);
    expect(stops.every((s) => s.locationCode === 'A-1')).toBe(true);
    expect(stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
  });

  it('geparkte Belege verlieren ihren Container (kein Geist-Container blockiert collectComplete)', () => {
    // The case for A-1 is gone from `cases` (parked); B-2's case remains.
    const stops = deriveStops([stop('s1', 0, 'A-1'), stop('s2', 1, 'B-2')], [kase('c2', 'B-2')]);
    expect(stops.map((s) => s.id)).toEqual(['c2']);
  });

  it('Container-Identität (Case-Id) bleibt über ein Backend-Resequencing stabil', () => {
    // Before park: three Belege on three locations, sequence 0/1/2.
    const before = deriveStops(
      [stop('s1', 0, 'A-1'), stop('s2', 1, 'B-2'), stop('s3', 2, 'C-3')],
      [kase('c1', 'A-1'), kase('c2', 'B-2'), kase('c3', 'C-3')],
    );
    expect(before.map((s) => s.id)).toEqual(['c1', 'c2', 'c3']);

    // After park: the backend renumbered C-3 to sequence 0 (now first) and the
    // Beleg on B-2 is gone (parked). The Case-Ids are unchanged — a collected
    // Set keyed by Case-Id still identifies c1 as "already collected" even
    // though its display position changed.
    const after = deriveStops(
      [stop('s3', 0, 'C-3'), stop('s1', 1, 'A-1'), stop('s2', 2, 'B-2')],
      [kase('c1', 'A-1'), kase('c3', 'C-3')],
    );
    expect(after.map((s) => s.id)).toEqual(['c3', 'c1']);
    expect(after.find((s) => s.id === 'c1')?.sequence).toBe(2);
  });
});

function kaseWithStatus(id: string, status: string) {
  return { id, status } as Parameters<typeof orderCasesForDisplay>[0][number];
}

describe('orderCasesForDisplay', () => {
  it('listet einen geparkten Problemfall (issue_open) ganz unten — trotz Engine-Sequenz 1', () => {
    const ordered = orderCasesForDisplay([
      kaseWithStatus('p', 'issue_open'),
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('b', 'in_progress'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['a', 'b', 'p']);
  });

  it('lässt die Engine-Reihenfolge unangetastet, wenn kein Problemfall geparkt ist — auch „Geklärt" (problem_resolved) sinkt NICHT', () => {
    const ordered = orderCasesForDisplay([
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('b', 'problem_resolved'),
      kaseWithStatus('c', 'completed'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('stabile Partition: mehrere Problemfälle behalten untereinander die Engine-Reihenfolge', () => {
    const ordered = orderCasesForDisplay([
      kaseWithStatus('p1', 'issue_open'),
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('p2', 'issue_open'),
      kaseWithStatus('b', 'assigned'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['a', 'b', 'p1', 'p2']);
  });
});
