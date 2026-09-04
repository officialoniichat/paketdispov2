/**
 * Nav-Rail der Shell: „DA.M.B" ist der einzige feste Eintrag, die fünf Reiter
 * hängen als aus-/einklappbare Gruppe darunter. Das Schnellaktionen-Flyout und
 * das Dev-Zeit-Badge haben eigene Tests und sind hier gestubbt (kein Store,
 * kein HTTP).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from '@paket/ui';
import { AppShell } from './AppShell.js';
import { NAV_VIEW_KEY } from '../lib/viewState.js';

vi.mock('../features/cockpit/SchnellaktionenFlyout.js', () => ({
  SchnellaktionenFlyout: () => null,
}));
vi.mock('./DevTimeBadge.js', () => ({ default: () => null }));

const REITER = ['Tagescockpit', 'Digitale Ablagen', 'Mitarbeiterboard', 'Belege', 'Admin & Regeln'];

function renderShell(startPfad: string): ReturnType<typeof render> {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[startPfad]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<h1>Seite Tagescockpit</h1>} />
            <Route path="belege" element={<h1>Seite Belege</h1>} />
            <Route path="belege/:caseId" element={<h1>Seite Belegdetails</h1>} />
            <Route
              path="experiment"
              element={
                <>
                  <h1>Seite DA.M.B</h1>
                  <Link to="/belege/WE-1">Beleg öffnen</Link>
                </>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

const nav = (): HTMLElement => screen.getByRole('navigation', { name: 'Hauptnavigation' });
const reiterLink = (name: string): HTMLElement | null =>
  within(nav()).queryByRole('link', { name });

beforeEach(() => {
  localStorage.clear();
});

describe('AppShell — DA.M.B-Gruppe in der Nav-Rail', () => {
  it('im DA.M.B sind die Reiter eingeklappt; ausgeklappt sind sie sichtbar und navigierbar', async () => {
    renderShell('/experiment');
    expect(within(nav()).getByRole('link', { name: 'DA.M.B' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav()).queryByText(/Experiment/)).toBeNull();
    for (const name of REITER) expect(reiterLink(name)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reiter ausklappen' }));
    for (const name of REITER) expect(reiterLink(name)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reiter einklappen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(reiterLink('Belege')!);
    expect(screen.getByRole('heading', { name: 'Seite Belege' })).toBeTruthy();
    expect(reiterLink('Belege')).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Reiter einklappen' }));
    await waitFor(() => expect(reiterLink('Tagescockpit')).toBeNull());
    // Die Seite bleibt — nur die Gruppe ist zu.
    expect(screen.getByRole('heading', { name: 'Seite Belege' })).toBeTruthy();
  });

  it('auf einem Reiter startet die Gruppe offen — Belegdetails zählen zu „Belege"', () => {
    renderShell('/belege/WE-1');
    expect(reiterLink('Belege')).toHaveAttribute('aria-current', 'page');
    for (const name of REITER) expect(reiterLink(name)).not.toBeNull();
  });

  it('Klick auf DA.M.B navigiert ohne die Gruppe anzufassen; ein Sprung auf einen Reiter klappt sie auf', async () => {
    renderShell('/belege');
    fireEvent.click(within(nav()).getByRole('link', { name: 'DA.M.B' }));
    expect(screen.getByRole('heading', { name: 'Seite DA.M.B' })).toBeTruthy();
    expect(reiterLink('Belege')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reiter einklappen' }));
    await waitFor(() => expect(reiterLink('Belege')).toBeNull());

    // Link aus der Seite heraus (z. B. Beleg aus der Matrix): die Gruppe öffnet
    // sich, damit der jetzt aktive Reiter sichtbar ist.
    fireEvent.click(screen.getByRole('link', { name: 'Beleg öffnen' }));
    expect(screen.getByRole('heading', { name: 'Seite Belegdetails' })).toBeTruthy();
    expect(reiterLink('Belege')).toHaveAttribute('aria-current', 'page');
  });

  it('der Ausklapp-Zustand wird persistiert und beim nächsten Start übernommen', () => {
    const erste = renderShell('/experiment');
    fireEvent.click(screen.getByRole('button', { name: 'Reiter ausklappen' }));
    expect(JSON.parse(localStorage.getItem(NAV_VIEW_KEY) ?? '{}')).toEqual({
      collapsed: false,
      reiterOffen: true,
    });
    erste.unmount();

    renderShell('/experiment');
    for (const name of REITER) expect(reiterLink(name)).not.toBeNull();
  });

  it('schmale Rail: Reiter bleiben als Icons mit Namen bedienbar, der Pfeil klappt weiter', () => {
    renderShell('/experiment');
    fireEvent.click(screen.getByRole('button', { name: 'Navigation einklappen' }));
    // Nur Icons — der Name lebt im aria-label (+ Tooltip), nicht als Text.
    expect(within(nav()).queryByText('DA.M.B')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reiter ausklappen' }));
    for (const name of REITER) expect(reiterLink(name)).not.toBeNull();
    expect(within(nav()).queryByText('Tagescockpit')).toBeNull();
    fireEvent.click(reiterLink('Tagescockpit')!);
    expect(screen.getByRole('heading', { name: 'Seite Tagescockpit' })).toBeTruthy();
  });
});
