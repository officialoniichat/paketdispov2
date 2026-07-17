import { describe, expect, it } from 'vitest';
import { deriveStops, orderCasesForDisplay } from './BundleHomeScreen.js';

function stop(id: string, sequence: number, locationCode: string, scanned = false) {
  return { id, sequence, locationCode, scanRequired: false, scanned };
}

function kase(id: string, storageLocationCode: string) {
  return { id, storageLocationCode } as Parameters<typeof deriveStops>[1][number];
}

describe('deriveStops', () => {
  it('orders stops by sequence and attaches the matching cases', () => {
    const stops = deriveStops(
      [stop('s2', 1, 'B-2'), stop('s1', 0, 'A-1')],
      [kase('c1', 'A-1'), kase('c2', 'B-2')],
    );
    expect(stops.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(stops.find((s) => s.id === 's1')?.caseIds).toEqual(['c1']);
    expect(stops.find((s) => s.id === 's2')?.caseIds).toEqual(['c2']);
  });

  it('drops a stop whose only case was parked away (no ghost stop left blocking collectComplete)', () => {
    // The case for A-1 is gone from `cases` (parked); B-2's case remains.
    const stops = deriveStops([stop('s1', 0, 'A-1'), stop('s2', 1, 'B-2')], [kase('c2', 'B-2')]);
    expect(stops.map((s) => s.id)).toEqual(['s2']);
  });

  it('keeps stop identity stable across a backend resequence (park renumbers sequence, not id)', () => {
    // Before park: three stops, sequence 0/1/2. The employee collected s1 (id-tracked).
    const before = deriveStops(
      [stop('s1', 0, 'A-1'), stop('s2', 1, 'B-2'), stop('s3', 2, 'C-3')],
      [kase('c1', 'A-1'), kase('c2', 'B-2'), kase('c3', 'C-3')],
    );
    expect(before.map((s) => s.id)).toEqual(['s1', 's2', 's3']);

    // After park: the backend renumbered s3 to sequence 0 (it's now first) and
    // removed the case for s2 (parked). The stop *ids* are unchanged.
    const after = deriveStops(
      [stop('s3', 0, 'C-3'), stop('s1', 1, 'A-1'), stop('s2', 2, 'B-2')],
      [kase('c1', 'A-1'), kase('c3', 'C-3')],
    );
    // s2 is gone (its case was parked); s1 and s3 remain, keyed by id — a
    // collected-state Set keyed by `id` (not `sequence`) still correctly
    // identifies s1 as "the stop I already collected" even though its
    // sequence number changed from 0 to 1.
    expect(after.map((s) => s.id)).toEqual(['s3', 's1']);
    expect(after.find((s) => s.id === 's1')?.sequence).toBe(1);
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
