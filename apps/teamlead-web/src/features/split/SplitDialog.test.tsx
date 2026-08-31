/**
 * Dialog „Beleg aufteilen": die oberste Frage `'Wie wird gearbeitet?'` entscheidet
 * über ZWEI verschiedene Aufträge ans Backend (Konzept beleg-zusammenarbeit §4).
 * Geprüft wird deshalb genau das, was der Dialog nach oben meldet — die Fachlogik
 * (wer darf, was passiert) liegt im Backend.
 */
import { useState, type JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppProviders, createQueryClient } from '@paket/ui';
import {
  SplitDialog,
  type SplitDialogBeleg,
  type SplitDialogEmployee,
  type SplitSubmit,
} from './SplitDialog.js';

const BELEG: SplitDialogBeleg = {
  caseId: 'c-1',
  weBelegNo: 'WE-4711',
  totalQuantity: 600,
  effortPoints: 40,
  estimatedMinutes: 480,
};

const EMPLOYEES: SplitDialogEmployee[] = [
  { id: 'e-1', employeeNo: 'MA-1', name: 'Anna Berger', ceilingMinutes: 300 },
  { id: 'e-2', employeeNo: 'MA-2', name: 'Ben Klein', ceilingMinutes: 280 },
  { id: 'e-3', employeeNo: 'MA-3', name: 'Carla Ruiz', ceilingMinutes: 260 },
];

function renderDialog(): { onConfirm: ReturnType<typeof vi.fn> } {
  const onConfirm = vi.fn();
  render(
    <AppProviders queryClient={createQueryClient({ retry: 0 })}>
      <SplitDialog
        open
        beleg={BELEG}
        employees={EMPLOYEES}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    </AppProviders>,
  );
  return { onConfirm };
}

/** true, solange die genannte Taste gesperrt ist (Pflichtgrund/Auswahl fehlt). */
function gesperrt(name: string): boolean {
  return screen.getByRole('button', { name }).hasAttribute('disabled');
}

/** Letzte Meldung des Dialogs nach oben. */
function letzterAufruf(onConfirm: ReturnType<typeof vi.fn>): SplitSubmit {
  return onConfirm.mock.calls.at(-1)?.[0] as SplitSubmit;
}

describe('SplitDialog', () => {
  it('startet im Modus „Gemeinsam bearbeiten" mit dem Hinweis auf den ganzen Beleg', () => {
    renderDialog();
    const modusTaste = screen.getByRole('button', { name: 'Gemeinsam bearbeiten' });
    expect(modusTaste.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByText(
        'Alle Beteiligten sehen den ganzen Beleg und arbeiten ihn zusammen ab. Der erste Mitarbeiter bekommt den Beleg in seinen Karren.',
      ),
    ).toBeTruthy();
    // Die Mengen-Oberfläche des Aufteilens ist im Standardmodus nicht sichtbar.
    expect(screen.queryByText('Wer bekommt die Teile?')).toBeNull();
    expect(gesperrt('Gemeinsam zuweisen')).toBe(true);
  });

  it('meldet zwei angehakte Mitarbeitende in Klickreihenfolge mit Pflicht-Grund', () => {
    const { onConfirm } = renderDialog();

    // Reihenfolge = Klickreihenfolge: Ben wird zuerst angehakt und bekommt den Karren.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ben Klein' }));
    expect(screen.getByText('Karren')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Anna Berger' }));

    // Ohne Grund bleibt die Primärtaste gesperrt (§8.4).
    expect(gesperrt('Gemeinsam zuweisen')).toBe(true);
    fireEvent.change(screen.getByLabelText('Grund'), {
      target: { value: 'Beleg zu groß für eine Person' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gemeinsam zuweisen' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(letzterAufruf(onConfirm)).toEqual({
      mode: 'gemeinsam',
      caseId: 'c-1',
      employeeNos: ['MA-2', 'MA-1'],
      reason: 'Beleg zu groß für eine Person',
    });
  });

  it('einer allein reicht nicht — die Primärtaste bleibt gesperrt', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Anna Berger' }));
    fireEvent.change(screen.getByLabelText('Grund'), { target: { value: 'Aushilfe' } });
    expect(gesperrt('Gemeinsam zuweisen')).toBe(true);
  });

  it('„In Teil-Belege aufteilen" zeigt die bisherige Mengen-Oberfläche', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'In Teil-Belege aufteilen' }));

    expect(screen.getByText('Wer bekommt die Teile?')).toBeTruthy();
    expect(screen.getByText('Anzahl Teile')).toBeTruthy();
    expect(screen.getByText('Verteilt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ohne Zuweisung' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gemeinsam zuweisen' })).toBeNull();

    // Die vorgeschlagene Aufteilung deckt den Beleg bereits vollständig ab.
    fireEvent.change(screen.getByLabelText('Grund'), {
      target: { value: 'Mengenvolumen zu groß' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'In 2 Teile aufteilen' }));

    const submit = letzterAufruf(onConfirm);
    expect(submit.mode).toBe('aufteilen');
    if (submit.mode !== 'aufteilen') throw new Error('Modus verfehlt');
    expect(submit.caseId).toBe('c-1');
    expect(submit.parts.map((p) => p.quantity)).toEqual([300, 300]);
    expect(submit.parts.every((p) => p.employeeNo === undefined)).toBe(true);
  });

  it('laufende Eingaben überleben eine Live-Auffrischung der Props (gleicher Beleg, neue Objekte)', () => {
    const onConfirm = vi.fn();
    const queryClient = createQueryClient({ retry: 0 });
    const dialog = (beleg: SplitDialogBeleg, employees: SplitDialogEmployee[]): JSX.Element => (
      <AppProviders queryClient={queryClient}>
        <SplitDialog
          open
          beleg={beleg}
          employees={employees}
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />
      </AppProviders>
    );
    const { rerender } = render(dialog(BELEG, EMPLOYEES));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ben Klein' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Anna Berger' }));
    fireEvent.change(screen.getByLabelText('Grund'), {
      target: { value: 'Beleg zu groß für eine Person' },
    });

    // Live-Refetch (SSE → invalidateQueries): gleiche Daten, neue Objekt-Identitäten.
    rerender(
      dialog(
        { ...BELEG },
        EMPLOYEES.map((e) => ({ ...e })),
      ),
    );

    const grund = screen.getByLabelText('Grund') as HTMLInputElement;
    expect(grund.value).toBe('Beleg zu groß für eine Person');
    expect((screen.getByRole('checkbox', { name: 'Ben Klein' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(gesperrt('Gemeinsam zuweisen')).toBe(false);

    // Ein ANDERER Beleg setzt den Dialog weiterhin frisch auf.
    rerender(dialog({ ...BELEG, caseId: 'c-2', weBelegNo: 'WE-4712' }, EMPLOYEES));
    expect((screen.getByLabelText('Grund') as HTMLInputElement).value).toBe('');
    expect(gesperrt('Gemeinsam zuweisen')).toBe(true);
  });

  it('die Backend-Fehlermeldung verschwindet beim Moduswechsel (onModusChange)', () => {
    const meldung = 'Nur 2 Größenzeilen — weniger Teile wählen.';
    // Nachbau der Aufrufer-Verdrahtung: error aus useSplitCase, onModusChange = clearError.
    function Harness(): JSX.Element {
      const [error, setError] = useState<string | null>(meldung);
      return (
        <SplitDialog
          open
          beleg={BELEG}
          employees={EMPLOYEES}
          error={error}
          onModusChange={() => setError(null)}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      );
    }
    render(
      <AppProviders queryClient={createQueryClient({ retry: 0 })}>
        <Harness />
      </AppProviders>,
    );

    expect(screen.getByText(meldung)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'In Teil-Belege aufteilen' }));
    expect(screen.queryByText(meldung)).toBeNull();
  });
});
