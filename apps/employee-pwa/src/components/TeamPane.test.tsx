// @vitest-environment jsdom
/**
 * „Team-Ansicht" (Zusammenarbeit 31.08.2026): eine andere Person → direkt die
 * Einzelansicht, mehrere → Raster mit Kästchen, Aufleuchten bei fremder Aktion.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  exampleAggregate,
  participant,
  withCollaboration,
  withConfirmedPositions,
} from '../test/exampleAggregate.js';
import { TeamPane } from './TeamPane.js';

const ICH = '100';
const ANNA = participant({
  participantId: 'p-anna',
  employeeNo: '101',
  displayName: 'Anna Berger',
  confirmedPositionCount: 2,
});
const BERND = participant({
  participantId: 'p-bernd',
  employeeNo: '102',
  displayName: 'Bernd Weiß',
  status: 'teil_erledigt',
  confirmedPositionCount: 1,
});
const INHABER = participant({
  participantId: 'p-ich',
  employeeNo: ICH,
  displayName: 'Ich Selbst',
  role: 'inhaber',
  confirmedPositionCount: 0,
});

/** Aggregat mit den genannten Beteiligten; Anna hat Pos 1 und 3 geprüft. */
function aggregateMit(...beteiligte: ReturnType<typeof participant>[]) {
  return withConfirmedPositions(
    withCollaboration(exampleAggregate, beteiligte, 2),
    { employeeNo: '101', displayName: 'Anna Berger' },
    ['pos-3656860-1', 'pos-3656860-3'],
  );
}

afterEach(cleanup);

describe('TeamPane', () => {
  it('zeigt oben den Gesamtfortschritt des BELEGS in Teilen, nicht je Person', () => {
    // Beispiel-Beleg: Pos 1 = 1 Teil, Pos 2 = 1 Teil, Pos 3 = 3 Teile (Σ 5).
    // Geprüft sind Pos 1 + 3 → 4 von 5 Teilen, also 80 % — obwohl es „nur"
    // 2 von 3 Positionen sind. Genau dafür ist die Leiste da.
    render(
      <TeamPane aggregate={aggregateMit(INHABER, ANNA)} meineEmployeeNo={ICH} glow={new Set()} />,
    );

    expect(screen.getByText('Gesamtfortschritt')).toBeTruthy();
    expect(screen.getByText('80 %')).toBeTruthy();
    expect(screen.getByText('4/5 Teile · 2/3 Positionen – alle Beteiligten zusammen')).toBeTruthy();
    expect(screen.getByLabelText('4 von 5 Teilen abgearbeitet')).toBeTruthy();
  });

  it('zeigt bei genau einer anderen Person direkt deren Einzelansicht', () => {
    render(
      <TeamPane aggregate={aggregateMit(INHABER, ANNA)} meineEmployeeNo={ICH} glow={new Set()} />,
    );

    expect(screen.getByText('Anna Berger')).toBeTruthy();
    expect(screen.getByText('hilft')).toBeTruthy();
    expect(screen.getByText('2/3 Positionen geprüft')).toBeTruthy();
    expect(screen.getByText('Pos 1 · Pos 3')).toBeTruthy();
    // Ohne Raster gibt es auch keinen Rückweg.
    expect(screen.queryByText('‹ Zurück zur Übersicht')).toBeNull();
    // Ich selbst stehe nie im Team-Raster.
    expect(screen.queryByText('Ich Selbst')).toBeNull();
  });

  it('zeigt bei mehreren ein Raster und öffnet die Einzelansicht per Tipp', () => {
    render(
      <TeamPane
        aggregate={aggregateMit(INHABER, ANNA, BERND)}
        meineEmployeeNo={ICH}
        glow={new Set()}
      />,
    );

    const kaestchen = screen.getByRole('button', { name: 'Anna Berger – Fortschritt anzeigen' });
    expect(screen.getByRole('button', { name: 'Bernd Weiß – Fortschritt anzeigen' })).toBeTruthy();
    // „Teil erledigt" steht am Kästchen des fertigen Beteiligten.
    expect(screen.getByText('Teil erledigt')).toBeTruthy();

    fireEvent.click(kaestchen);

    expect(screen.getByText('Pos 1 · Pos 3')).toBeTruthy();
    const zurueck = screen.getByText('‹ Zurück zur Übersicht');

    fireEvent.click(zurueck);
    expect(screen.getByRole('button', { name: 'Bernd Weiß – Fortschritt anzeigen' })).toBeTruthy();
  });

  it('lässt das Kästchen dessen aufleuchten, der gerade gehandelt hat', () => {
    render(
      <TeamPane
        aggregate={aggregateMit(INHABER, ANNA, BERND)}
        meineEmployeeNo={ICH}
        glow={new Set(['102'])}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Bernd Weiß – Fortschritt anzeigen' }).dataset.glow,
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Anna Berger – Fortschritt anzeigen' }).dataset.glow,
    ).toBeUndefined();
  });

  it('zeigt „Noch keine Position geprüft", solange nichts abgehakt ist', () => {
    render(
      <TeamPane
        aggregate={withCollaboration(exampleAggregate, [INHABER, ANNA], 0)}
        meineEmployeeNo={ICH}
        glow={new Set()}
      />,
    );

    expect(screen.getByText('Noch keine Position geprüft')).toBeTruthy();
  });

  it('rendert nichts, wenn niemand sonst aktiv beteiligt ist', () => {
    const { container } = render(
      <TeamPane
        aggregate={withCollaboration(exampleAggregate, [INHABER])}
        meineEmployeeNo={ICH}
        glow={new Set()}
      />,
    );

    expect(container.textContent).toBe('');
  });
});
