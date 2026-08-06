import { describe, expect, it } from 'vitest';
import {
  casesForDisplay,
  deriveStops,
  isCaseClosed,
  stopsForDisplay,
} from './BundleHomeScreen.js';

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

type Kase = Parameters<typeof casesForDisplay>[0][number];

function kaseWithStatus(id: string, status: string) {
  return { id, status } as Kase;
}

/**
 * Beleg mit Meldungen (Instruktions-Loop 04.08.2026): `issueStatuses` sind die
 * Einzel-Status der Meldungen — 'open' = wartet auf die Teamleitung,
 * 'instruction_sent' = vom Teamlead instruiert.
 */
function kaseWithIssues(id: string, status: string, issueStatuses: string[]) {
  return {
    id,
    status,
    issues: issueStatuses.map((s, index) => ({ id: `${id}-i${index}`, status: s })),
  } as Kase;
}

describe('casesForDisplay', () => {
  it('listet einen geparkten Problemfall (issue_open) ganz unten — trotz Engine-Sequenz 1', () => {
    const ordered = casesForDisplay([
      kaseWithStatus('p', 'issue_open'),
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('b', 'in_progress'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['a', 'b', 'p']);
  });

  it('blendet fertige Belege (completed/zst_done) KOMPLETT aus — Kundenfeedback 04.08.2026', () => {
    const ordered = casesForDisplay([
      kaseWithStatus('f1', 'completed'),
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('f2', 'zst_done'),
      kaseWithStatus('b', 'in_progress'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('behält Problem-Loop-Belege sichtbar: issue_open (unten) und problem_resolved sind fachlich NICHT fertig', () => {
    const ordered = casesForDisplay([
      kaseWithStatus('p', 'issue_open'),
      kaseWithStatus('f', 'completed'),
      kaseWithStatus('r', 'problem_resolved'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['r', 'p']);
  });

  it('setzt einen geklärten Beleg (problem_resolved) an den ANFANG — Kundenfeedback 05.08.2026', () => {
    const ordered = casesForDisplay([
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('r', 'problem_resolved'),
      kaseWithStatus('c', 'in_progress'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['r', 'a', 'c']);
  });

  it('geklärt ganz oben, geparkt ganz unten, normale Belege dazwischen in Engine-Reihenfolge', () => {
    const ordered = casesForDisplay([
      kaseWithStatus('p', 'issue_open'),
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('r', 'problem_resolved'),
      kaseWithStatus('b', 'in_progress'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['r', 'a', 'b', 'p']);
  });

  it('Rückmeldung: der zurückgeworfene Beleg (problem_resolved → issue_open) wandert wieder ans ENDE', () => {
    const vorRueckmeldung = casesForDisplay([
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('r', 'problem_resolved'),
    ]);
    expect(vorRueckmeldung.map((c) => c.id)).toEqual(['r', 'a']);

    // Das Backend hat 'r' auf issue_open zurückgesetzt (Meldung erneut offen) —
    // die Anzeige folgt allein diesem Status, ohne eigenen Zustand.
    const nachRueckmeldung = casesForDisplay([
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('r', 'issue_open'),
    ]);
    expect(nachRueckmeldung.map((c) => c.id)).toEqual(['a', 'r']);
  });

  it('stabile Partition: mehrere Belege derselben Gruppe behalten untereinander die Engine-Reihenfolge', () => {
    const ordered = casesForDisplay([
      kaseWithStatus('p1', 'issue_open'),
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('r1', 'problem_resolved'),
      kaseWithStatus('p2', 'issue_open'),
      kaseWithStatus('b', 'assigned'),
      kaseWithStatus('r2', 'problem_resolved'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['r1', 'r2', 'a', 'b', 'p1', 'p2']);
  });

  /* Instruktions-Loop: maßgeblich sind die EINZEL-Status der Meldungen, nicht
     ein Status-Wort am Beleg (Kundenfeedback 05.08.2026). */
  it('alle Meldungen instruiert → an den ANFANG, auch ohne Status „problem_resolved"', () => {
    const ordered = casesForDisplay([
      kaseWithStatus('a', 'assigned'),
      kaseWithIssues('i', 'in_progress', ['instruction_sent', 'instruction_sent']),
      kaseWithStatus('b', 'assigned'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['i', 'a', 'b']);
  });

  it('TEILWEISE instruiert (eine Meldung noch offen) → bleibt gesperrt und damit ganz UNTEN', () => {
    const ordered = casesForDisplay([
      kaseWithIssues('t', 'issue_open', ['instruction_sent', 'open']),
      kaseWithStatus('a', 'assigned'),
      kaseWithIssues('v', 'problem_resolved', ['instruction_sent']),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['v', 'a', 't']);
  });

  it('Rückmeldung öffnet eine Meldung erneut → der Beleg wandert wieder ans ENDE', () => {
    const vorRueckmeldung = casesForDisplay([
      kaseWithStatus('a', 'assigned'),
      kaseWithIssues('r', 'problem_resolved', ['instruction_sent']),
    ]);
    expect(vorRueckmeldung.map((c) => c.id)).toEqual(['r', 'a']);

    // Backend nach der Rückmeldung: Meldung wieder `open`, Beleg `issue_open`.
    const nachRueckmeldung = casesForDisplay([
      kaseWithStatus('a', 'assigned'),
      kaseWithIssues('r', 'issue_open', ['open']),
    ]);
    expect(nachRueckmeldung.map((c) => c.id)).toEqual(['a', 'r']);
  });

  it('Belege ohne Meldung bleiben neutral — eine leere Meldungsliste hebt nichts hoch', () => {
    const ordered = casesForDisplay([
      kaseWithIssues('a', 'assigned', []),
      kaseWithIssues('b', 'in_progress', []),
      kaseWithStatus('c', 'assigned'),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

function stopView(id: string, sequence: number, locationCode: string) {
  return { id, sequence, locationCode, caseIds: [id] };
}

describe('stopsForDisplay', () => {
  it('zieht den Abhol-Container eines geklärten Belegs nach OBEN und den geparkten nach UNTEN', () => {
    const ordered = stopsForDisplay(
      [stopView('p', 1, 'A-1'), stopView('a', 2, 'B-2'), stopView('r', 3, 'C-3')],
      [
        kaseWithStatus('p', 'issue_open'),
        kaseWithStatus('a', 'assigned'),
        kaseWithStatus('r', 'problem_resolved'),
      ],
    );
    expect(ordered.map((s) => s.id)).toEqual(['r', 'a', 'p']);
  });

  it('gleiche Reihenfolge wie „2 · Bearbeiten" — die Abschnitte sortieren nie widersprüchlich', () => {
    const cases = [
      kaseWithStatus('p', 'issue_open'),
      kaseWithStatus('a', 'assigned'),
      kaseWithStatus('r', 'problem_resolved'),
      kaseWithStatus('b', 'in_progress'),
    ];
    const stops = cases.map((c, index) => stopView(c.id, index + 1, `L-${index + 1}`));
    expect(stopsForDisplay(stops, cases).map((s) => s.id)).toEqual(
      casesForDisplay(cases).map((c) => c.id),
    );
  });

  it('Container fertiger Belege verschwinden; ohne Problemfall bleibt die Engine-Route unangetastet', () => {
    const ordered = stopsForDisplay(
      [stopView('c1', 1, 'A-1'), stopView('f', 2, 'B-2'), stopView('c2', 3, 'C-3')],
      [
        kaseWithStatus('c1', 'assigned'),
        kaseWithStatus('f', 'completed'),
        kaseWithStatus('c2', 'in_progress'),
      ],
    );
    expect(ordered.map((s) => s.id)).toEqual(['c1', 'c2']);
  });
});

describe('isCaseClosed', () => {
  it('fertig = completed/zst_done; Problem-Loop und Arbeit zählen NICHT als fertig', () => {
    expect(isCaseClosed('completed')).toBe(true);
    expect(isCaseClosed('zst_done')).toBe(true);
    expect(isCaseClosed('assigned')).toBe(false);
    expect(isCaseClosed('in_progress')).toBe(false);
    expect(isCaseClosed('issue_open')).toBe(false);
    expect(isCaseClosed('problem_resolved')).toBe(false);
  });
});
