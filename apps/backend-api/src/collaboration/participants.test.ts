import { describe, expect, it } from 'vitest';
import { toCollaborationDto, toParticipantDto, type ParticipantRow } from './participants.js';

function row(overrides: Partial<ParticipantRow> & { employeeId: string }): ParticipantRow {
  return {
    id: `part-${overrides.employeeId}`,
    role: 'helfer',
    status: 'angenommen',
    invitedAt: new Date('2026-08-31T08:00:00.000Z'),
    respondedAt: null,
    partDoneAt: null,
    employee: {
      employeeNo: `E-${overrides.employeeId}`,
      displayName: `MA ${overrides.employeeId}`,
    },
    ...overrides,
  };
}

describe('toCollaborationDto — Projektion Beteiligte + Prüf-Fortschritt', () => {
  it('liefert null, solange der Beleg nie geteilt wurde', () => {
    expect(toCollaborationDto([], [{ confirmedById: null }])).toBeNull();
  });

  it('zählt geprüfte Positionen gesamt und je Beteiligtem (confirmedById)', () => {
    const participants = [
      row({ employeeId: 'u1', role: 'inhaber' }),
      row({ employeeId: 'u2' }),
      row({ employeeId: 'u3', status: 'eingeladen' }),
    ];
    const positions = [
      { confirmedById: 'u1' },
      { confirmedById: 'u1' },
      { confirmedById: 'u2' },
      { confirmedById: null },
    ];
    const dto = toCollaborationDto(participants, positions);
    expect(dto).not.toBeNull();
    expect(dto?.positionCount).toBe(4);
    expect(dto?.confirmedPositionCount).toBe(3);
    expect(dto?.participants.map((p) => p.confirmedPositionCount)).toEqual([2, 1, 0]);
    // Reihenfolge bleibt die übergebene (chronologisch sortiert der Aufrufer).
    expect(dto?.participants.map((p) => p.employeeNo)).toEqual(['E-u1', 'E-u2', 'E-u3']);
  });

  it('Prüfer außerhalb der Beteiligten (z. B. später entfernt) zählen nur in die Gesamtzahl', () => {
    const dto = toCollaborationDto([row({ employeeId: 'u1' })], [{ confirmedById: 'fremd' }]);
    expect(dto?.confirmedPositionCount).toBe(1);
    expect(dto?.participants[0]?.confirmedPositionCount).toBe(0);
  });
});

describe('toParticipantDto', () => {
  it('projiziert Zeiten als ISO-8601 und nimmt die Zählung des Aufrufers', () => {
    const dto = toParticipantDto(
      row({
        employeeId: 'u9',
        status: 'teil_erledigt',
        respondedAt: new Date('2026-08-31T09:00:00.000Z'),
        partDoneAt: new Date('2026-08-31T10:30:00.000Z'),
      }),
      5,
    );
    expect(dto).toMatchObject({
      participantId: 'part-u9',
      employeeNo: 'E-u9',
      role: 'helfer',
      status: 'teil_erledigt',
      invitedAt: '2026-08-31T08:00:00.000Z',
      respondedAt: '2026-08-31T09:00:00.000Z',
      partDoneAt: '2026-08-31T10:30:00.000Z',
      confirmedPositionCount: 5,
    });
  });
});
