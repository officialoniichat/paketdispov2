import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProviders } from '@paket/ui';
import { App } from './App.js';

describe('Teamlead cockpit shell', () => {
  it('renders the Tagescockpit and the nav lanes', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );
    expect(screen.getByRole('heading', { name: /Logistik Warenauszeichnung/i })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: /Hauptnavigation/i })).toBeTruthy();
    expect(screen.getAllByText(/Digitale Ablagen/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Neu berechnen/i)).toBeTruthy();
  });
});
