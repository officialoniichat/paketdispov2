import { test, expect, type Page } from './fixtures/test.js';

/**
 * WE-Beleg-Detailansicht — zusammengeführte Ansicht (Kundenfeedback 15.07.2026).
 *
 * Läuft gegen den echten, geseedeten Backend aus `fixtures/global-setup.ts`.
 * Deckt ab: (1) die Reiterleiste ist auf Beleg · Aufwand · Abschluss · Historie ·
 * Priorität reduziert — Positionen, Boxen und Problem sind als eigenständige
 * Reiter entfallen, „Priorität" steht ganz rechts; (2) der Beleg-Tab bildet
 * Kopf, Positionen und Probleme in EINER Ansicht ab (Vorlage: die kombinierte
 * Darstellung im employee-pwa BelegProcessScreen), inklusive Problem-Chips
 * direkt an der Position; (3) „Details" aus der Digitalen Ablage landet direkt
 * auf dieser Beleg-Ansicht (der frühere `?tab=problem`-Deep-Link ist entfallen).
 */

/** Der Aufrufweg der Anforderung: Digitale Ablage → Karte des Belegs → „Details". */
async function openDetailsFromAblage(page: Page, weBelegNo: string): Promise<void> {
  await page.goto('/ablagen');
  await expect(page.getByRole('heading', { name: 'Digitale Ablagen' })).toBeVisible();
  const card = page.locator('.MuiCard-root').filter({ hasText: weBelegNo }).first();
  await card.getByRole('button', { name: 'Details' }).click();
  await expect(page).toHaveURL(/\/belege\//);
}

test('Reiterleiste: nur Beleg·Aufwand·Abschluss·Historie·Priorität, „Priorität" ganz rechts', async ({
  page,
}) => {
  // WE-2026-000209 — der weitergeleitete Beispiel-Beleg aus der Digitalen Ablage.
  await openDetailsFromAblage(page, 'WE-2026-000209');

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText(['Beleg', 'Aufwand', 'Abschluss', 'Historie', 'Priorität']);
  await expect(page.getByRole('tab', { name: 'Positionen' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Boxen' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Problem' })).toHaveCount(0);

  // „Priorität" ganz rechts bleibt voll funktionsfähig.
  await page.getByRole('tab', { name: 'Priorität' }).click();
  await expect(page.getByText('Abschnitt', { exact: true })).toBeVisible();
  await expect(page.getByText('Prio-Flags', { exact: true })).toBeVisible();
});

test('Beleg-Tab: Kopf + Positionen + Probleme in EINER Ansicht', async ({ page }) => {
  await openDetailsFromAblage(page, 'WE-2026-000209');

  // Kopf-Abschnitt (Beleg-Kopf) …
  await expect(page.getByText('Kopf', { exact: true })).toBeVisible();
  await expect(page.getByText('WE-Belegnummer', { exact: true })).toBeVisible();
  await expect(page.getByText('LS-2026-000209')).toBeVisible();
  await expect(page.getByText('Buchungsdatum', { exact: true })).toBeVisible();

  // … die eine Positionen-Tabelle (PWA-Vorlage: sticky Kopfzeile,
  // Positions-Kopfzeile mit Ordernummer, Größenzeilen mit Soll/Ist) …
  await expect(page.getByText('Positionen', { exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: 'Positionen' });
  await expect(table.getByRole('columnheader', { name: 'EAN' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Mehr-/Mindermenge' })).toBeVisible();
  await expect(table.getByText('Pos 1', { exact: true })).toBeVisible();
  await expect(table.getByText('Order ORD-WE-2026-000209-1')).toBeVisible();
  await expect(table.getByText('Soll gesamt 22')).toBeVisible();

  // … und die Probleme des Belegs — hier ohne offene Probleme.
  await expect(page.getByText('Probleme', { exact: true })).toBeVisible();
  await expect(page.getByText('Keine Probleme gemeldet.')).toBeVisible();
});

test('Problemfall: Beleg-Ansicht zeigt Problem-Chip an der Position und die Problem-Liste', async ({
  page,
}) => {
  // WE-2026-000205 (issue_open) — „Details" aus der „Probleme"-Lane landet direkt
  // auf der kombinierten Beleg-Ansicht (kein `?tab=`-Deep-Link mehr).
  await openDetailsFromAblage(page, 'WE-2026-000205');
  await expect(page).not.toHaveURL(/tab=/);
  await expect(page.getByRole('tab', { name: 'Beleg' })).toHaveAttribute('aria-selected', 'true');

  // Das Problem steht als roter Chip direkt an seiner Position (PWA-Vorlage
  // Punkt 9) …
  const table = page.getByRole('table', { name: 'Positionen' });
  await expect(
    table.getByText('falsche Farbe: Farbe weicht von Arbeitsanweisung ab'),
  ).toBeVisible();

  // … und in der Problem-Liste darunter (Klärungs-UX mit Katalog-Label).
  await expect(page.getByRole('paragraph').filter({ hasText: /^falsche Farbe$/ })).toBeVisible();
  await expect(page.getByText(/Nach „Probleme geklärt/)).toBeVisible();

  // Der Beleg-weite Problem-Banner springt von jedem Reiter zurück zur Beleg-Ansicht.
  await expect(page.getByText(/Offenes Problem:/)).toBeVisible();
  await page.getByRole('tab', { name: 'Historie' }).click();
  await page.getByRole('button', { name: 'Zum Problem' }).click();
  await expect(page.getByRole('tab', { name: 'Beleg' })).toHaveAttribute('aria-selected', 'true');
});
