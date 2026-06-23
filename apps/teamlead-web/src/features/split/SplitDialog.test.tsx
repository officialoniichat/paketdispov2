import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@paket/ui';
import { SplitDialog, type SplitDialogBeleg, type SplitDialogEmployee } from './SplitDialog.js';
import type { RecordSplitInput } from './SplitProvider.js';

const BELEG: SplitDialogBeleg = {
  caseId: 'case-412',
  weBelegNo: 'WE-2026-000412',
  totalQuantity: 3000,
  effortPoints: 1382,
  estimatedMinutes: 1382,
};

const EMPLOYEES: SplitDialogEmployee[] = [
  { id: 'emp-ak', name: 'A. Köhler', ceilingMinutes: 390 },
  { id: 'emp-mb', name: 'M. Brandt', ceilingMinutes: 390 },
  { id: 'emp-lv', name: 'L. Vogt', ceilingMinutes: 390 },
  { id: 'emp-tn', name: 'T. Nowak', ceilingMinutes: 390 },
];

function renderDialog(onConfirm = vi.fn()) {
  const onClose = vi.fn();
  render(
    <AppProviders>
      <SplitDialog open beleg={BELEG} employees={EMPLOYEES} onConfirm={onConfirm} onClose={onClose} />
    </AppProviders>,
  );
  return { onConfirm, onClose };
}

describe('SplitDialog', () => {
  it('opens seeded with the Beleg, an engine-suggested split and the case figures', () => {
    renderDialog();
    expect(screen.getByText(/WE-2026-000412/)).toBeTruthy();
    expect(screen.getAllByText(/3\.000 Teile/).length).toBeGreaterThan(0);
    // 1382 min vs a 390-min shift → engine suggests 4 → 4 quantity inputs.
    expect(screen.getAllByLabelText(/Menge Anteil/)).toHaveLength(4);
  });

  it('keeps confirm disabled until a reason is given, then commits the split', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    const confirm = screen.getByRole('button', { name: /Aufteilen bestätigen/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Mengenvolumen zu groß' }));
    expect(confirm.disabled).toBe(false);

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const input = onConfirm.mock.calls[0]![0] as RecordSplitInput;
    expect(input.caseId).toBe('case-412');
    expect(input.captureMode).toBe('getrennt');
    expect(input.reason).toBe('Mengenvolumen zu groß');
    expect(input.shares.reduce((s, x) => s + x.quantity, 0)).toBe(3000);
  });

  it('blocks confirm when a share is over-assigned', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Koffer / sperrig' }));

    const firstQty = screen.getAllByLabelText(/Menge Anteil/)[0]!;
    await user.clear(firstQty);
    await user.type(firstQty, '5000');

    expect(screen.getByText(/Summe übersteigt die Belegmenge/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Aufteilen bestätigen/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('switches the capture mode to anteilig', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'anteilig' }));
    await user.click(screen.getByRole('button', { name: 'Schicht reicht nicht' }));
    await user.click(screen.getByRole('button', { name: /Aufteilen bestätigen/ }));
    const input = onConfirm.mock.calls[0]![0] as RecordSplitInput;
    expect(input.captureMode).toBe('anteilig');
  });

  it('re-suggests a different number of shares', async () => {
    const user = userEvent.setup();
    renderDialog();
    // The "Vorschlag (Anzahl)" group: pick 2.
    const group = screen.getByText('Vorschlag (Anzahl)').parentElement!;
    await user.click(within(group).getByRole('button', { name: '2' }));
    expect(screen.getAllByLabelText(/Menge Anteil/)).toHaveLength(2);
  });
});
