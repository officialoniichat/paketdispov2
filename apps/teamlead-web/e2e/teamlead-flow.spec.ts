import { test, expect } from '@playwright/test';

/**
 * Teamlead-Dashboard happy-path E2E (pre-pilot acceptance §17.1 + §8.4).
 *
 * Runs against the seeded in-memory cockpit store. Covers: the Tagescockpit
 * loading with KPIs, navigation across the nav rail, and the two audit gates —
 * every override (Priorisieren/Parken) and the "Neu berechnen" simulation can
 * only be confirmed WITH a reason (§8.4 Anti-Cherry-Picking).
 */

test('§17.1 Cockpit – Tagescockpit lädt mit KPIs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Heute – Logistik Warenauszeichnung/ })).toBeVisible();
  // KPI cards from the seeded cockpit data.
  await expect(page.getByText('Netto-Kapazität')).toBeVisible();
  await expect(page.getByText('Auslastung')).toBeVisible();
  await expect(page.getByText('ZST-Fortschritt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neu berechnen' })).toBeVisible();
});

test('§17.1 Navigation – Nav-Rail erreicht alle Kernflächen', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });

  await nav.getByRole('link', { name: 'Digitale Ablagen' }).click();
  await expect(page.getByRole('heading', { name: 'Digitale Ablagen' })).toBeVisible();

  await nav.getByRole('link', { name: 'Belege' }).click();
  await expect(page).toHaveURL(/\/belege$/);

  await nav.getByRole('link', { name: 'Admin & Regeln' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await nav.getByRole('link', { name: 'Tagescockpit' }).click();
  await expect(page.getByRole('heading', { name: /Heute – Logistik Warenauszeichnung/ })).toBeVisible();
});

test('§8.4 override requires reason – Priorisieren-Bestätigung erst ab Grund ≥3 Zeichen', async ({
  page,
}) => {
  await page.goto('/ablagen');
  await expect(page.getByRole('heading', { name: 'Digitale Ablagen' })).toBeVisible();

  // Open the override dialog from the first card that offers Priorisieren.
  await page.getByRole('button', { name: 'Priorisieren' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Bestätigen' });

  // §8.4: confirm is disabled with no reason and with a too-short reason.
  await expect(confirm).toBeDisabled();
  const reason = dialog.getByLabel(/Grund \(Pflichtfeld\)/);
  await reason.fill('ab');
  await expect(confirm).toBeDisabled();

  // Becomes enabled once the reason clears the minimum length (≥3 chars).
  await reason.fill('Kunde wartet');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();
});

test('§8.4 override requires reason – Parken folgt demselben Audit-Gate', async ({ page }) => {
  await page.goto('/ablagen');
  await page.getByRole('button', { name: 'Parken' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Bestätigen' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Grund \(Pflichtfeld\)/).fill('Wartet auf Klärung');
  await expect(confirm).toBeEnabled();
});

test('§8.4 Neu berechnen – Simulation braucht einen Grund zum Live-Zuweisen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neu berechnen' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Neu berechnen – Vorschlag/ })).toBeVisible();

  const commit = dialog.getByRole('button', { name: 'Live zuweisen' });
  // Commit (a teamlead override) is blocked until a reason is given (§8.4).
  await expect(commit).toBeDisabled();
  await dialog.getByLabel(/Grund für Neuverteilung \(Pflichtfeld\)/).fill('Spitze ausgleichen');
  await expect(commit).toBeEnabled();
});
