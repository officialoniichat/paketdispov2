import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AppProviders } from '@paket/ui';
import { App } from './App.js';

describe('Teamlead cockpit shell', () => {
  it('renders the Tagescockpit and the nav lanes', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );
    expect(screen.getByRole('heading', { name: /L&T Cockpit/i })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: /Hauptnavigation/i });
    // Haupteintrag der Rail heißt „DA.M.B" — ohne „Experiment".
    expect(within(nav).getByRole('link', { name: 'DA.M.B' })).toBeTruthy();
    expect(within(nav).queryByText(/Experiment/)).toBeNull();
    // Auf dem Tagescockpit (ein Reiter der Gruppe) ist die Gruppe aufgeklappt.
    expect(within(nav).getByRole('link', { name: 'Tagescockpit' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByText(/Digitale Ablagen/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Vorschlag ansehen/i)).toBeTruthy();
  });
});
