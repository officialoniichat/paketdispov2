import { describe, expect, it } from 'vitest';
import {
  completeGateError,
  partialGateError,
  unconfirmedPositions,
  type GatePosition,
} from './collaboration-gate.js';

function pos(positionNo: number, confirmedById: string | null): GatePosition {
  return { positionId: `p-${positionNo}`, positionNo, confirmedById };
}

describe('completeGateError — „Beleg erledigt" braucht alle Positionen geprüft (§5.2)', () => {
  it('erlaubt den Abschluss, wenn alles geprüft ist', () => {
    expect(completeGateError([pos(1, 'u1'), pos(2, 'u2')])).toBeNull();
    expect(completeGateError([])).toBeNull();
  });

  it('nennt Anzahl und Positionsnummern der ungeprüften Positionen (sortiert)', () => {
    const error = completeGateError([pos(3, null), pos(1, null), pos(2, 'u1')]);
    expect(error).toBe(
      'Noch 2 Positionen ungeprüft (1, 3) – erst prüfen oder Teilabschluss verwenden.',
    );
  });

  it('spricht bei genau einer Position im Singular', () => {
    expect(completeGateError([pos(2, null)])).toBe(
      'Noch 1 Position ungeprüft (2) – erst prüfen oder Teilabschluss verwenden.',
    );
  });
});

describe('partialGateError — ungeprüfte Positionen müssen Problem-Positionen sein', () => {
  it('erlaubt den Teilabschluss, wenn jede ungeprüfte Position ein Problem trägt', () => {
    const positions = [pos(1, 'u1'), pos(2, null), pos(3, null)];
    expect(partialGateError(positions, new Set(['p-2', 'p-3']))).toBeNull();
  });

  it('blockt, wenn eine ungeprüfte Position ohne Problem bleibt', () => {
    const positions = [pos(1, null), pos(2, null)];
    expect(partialGateError(positions, new Set(['p-1']))).toBe(
      'Noch 1 Position ungeprüft (2) – prüfen oder ein Problem dazu melden.',
    );
  });

  it('geprüfte Positionen brauchen nie ein Problem', () => {
    expect(partialGateError([pos(1, 'u1')], new Set())).toBeNull();
  });
});

describe('unconfirmedPositions', () => {
  it('liefert genau die Positionen ohne Prüfer', () => {
    const open = unconfirmedPositions([pos(1, 'u1'), pos(2, null)]);
    expect(open.map((p) => p.positionId)).toEqual(['p-2']);
  });
});
