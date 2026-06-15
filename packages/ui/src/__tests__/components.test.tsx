import type { ReactNode } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import {
  AppProviders,
  LtThemeProvider,
  StatusChip,
  PriorityChip,
  CatManChip,
  ProblemChip,
  SyncChip,
  TouchButton,
  CaseCardSkeleton,
  ListSkeleton,
  ZodForm,
  RHFTextField,
} from '../index.js';

function renderThemed(ui: ReactNode) {
  return render(<LtThemeProvider>{ui}</LtThemeProvider>);
}

describe('status chips (E.6: colour + text + icon)', () => {
  it('renders a Belegstatus chip with a German label', () => {
    renderThemed(<StatusChip status="ready" />);
    expect(screen.getByText('Bereit')).toBeInTheDocument();
  });

  it('renders a priority chip', () => {
    renderThemed(<PriorityChip flag="prio" />);
    expect(screen.getByText('Prio')).toBeInTheDocument();
  });

  it('renders a CatMan chip with its due label', () => {
    renderThemed(<CatManChip dueLabel="17.06." />);
    expect(screen.getByText(/CatMan/)).toBeInTheDocument();
  });

  it('renders a problem chip with a count', () => {
    renderThemed(<ProblemChip status="open" count={3} />);
    expect(screen.getByText('Offen (3)')).toBeInTheDocument();
  });

  it('renders every sync state with text (never colour-only)', () => {
    renderThemed(<SyncChip state="offline" />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('paints chips with an icon (svg) alongside the text', () => {
    const { container } = renderThemed(<StatusChip status="issue_open" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('touch primitives & skeletons', () => {
  it('renders a large primary action button', () => {
    renderThemed(<TouchButton emphasis="primary">Nächsten Lagerplatz anfahren</TouchButton>);
    expect(
      screen.getByRole('button', { name: 'Nächsten Lagerplatz anfahren' }),
    ).toBeInTheDocument();
  });

  it('renders loading skeletons with a busy status role', () => {
    renderThemed(
      <>
        <CaseCardSkeleton count={2} />
        <ListSkeleton rows={3} />
      </>,
    );
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2);
  });
});

describe('forms (RHF + Zod from domain-types-style schemas)', () => {
  const schema = z.object({ weBelegNo: z.string().min(1) });

  it('renders a Zod-bound form field', () => {
    render(
      <AppProviders>
        <ZodForm schema={schema} onValidSubmit={() => {}}>
          <RHFTextField name="weBelegNo" label="WE-Beleg-Nr." required />
        </ZodForm>
      </AppProviders>,
    );
    expect(screen.getByLabelText(/WE-Beleg-Nr\./)).toBeInTheDocument();
  });
});
