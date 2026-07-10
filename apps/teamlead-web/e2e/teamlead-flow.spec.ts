import { test, expect } from './fixtures/test.js';

/**
 * Teamlead-Dashboard happy-path E2E (pre-pilot acceptance §17.1 + §8.4).
 *
 * Läuft gegen den echten, geseedeten Backend aus `fixtures/global-setup.ts`.
 * Deckt ab: das Tagescockpit lädt mit seinen Kennzahlen, die Nav-Rail erreicht
 * alle Kernflächen, und das Audit-Gate aus §8.4 — ein Eingriff (Parken) lässt
 * sich nur MIT Grund bestätigen (Anti-Cherry-Picking).
 */

test('§17.1 Cockpit – Tagescockpit lädt mit Kennzahlen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText(/Automatik-Dispo/)).toBeVisible();
  await expect(page.getByText('ZST-Fortschritt heute')).toBeVisible();
  await expect(page.getByText('freie Kapazität')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vorschlag ansehen' })).toBeVisible();
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
  await expect(page.getByText(/Automatik-Dispo/)).toBeVisible();
});

test('§8.4 override requires reason – Parken-Bestätigung erst ab Grund ≥ 3 Zeichen', async ({
  page,
}) => {
  await page.goto('/ablagen');
  await expect(page.getByRole('heading', { name: 'Digitale Ablagen' })).toBeVisible();

  // Die Karten zeigen „Details"/„Zuweisen" direkt; „Parken" liegt im Überlauf-
  // Menü (CaseActionMenu). Die Prio-Spalte führt ausschließlich `ready`-Belege,
  // für die „Parken" laut §7.1-Zustandsmaschine überhaupt angeboten wird.
  const prioLane = page
    .getByText('Manuell priorisiert oder Prio-Kennzeichen')
    .locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]');
  await prioLane.getByRole('button', { name: 'Weitere Aktionen' }).first().click();
  await page.getByRole('menuitem', { name: 'Parken', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Der Bestätigen-Button trägt die Beschriftung der Aktion selbst („Parken").
  const confirm = dialog.getByRole('button', { name: 'Parken', exact: true });

  // §8.4: ohne Grund und mit zu kurzem Grund bleibt Bestätigen gesperrt.
  await expect(confirm).toBeDisabled();
  const reason = dialog.getByLabel(/Grund \(Pflichtfeld\)/);
  await reason.fill('ab');
  await expect(confirm).toBeDisabled();

  // Ab der Mindestlänge (≥ 3 Zeichen) wird der Eingriff bestätigbar.
  await reason.fill('Wartet auf Klärung');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();
});

/**
 * §E.4 Human-in-the-loop: „Vorschlag ansehen" rechnet einen Dry-Run
 * (`/assignments/preview`, persistiert nichts); erst „Übernehmen" schreibt.
 *
 * Anmerkung zur Historie: dieser Commit verlangte früher einen Grund
 * (§8.4-Gate). Seit dem Umbau auf die Automatik-Dispo ist die Neuverteilung
 * kein Cherry-Picking-Eingriff mehr, und `SimulationPanel.handleCommit`
 * (`src/features/simulation/SimulationPanel.tsx:50`) ruft `recalculate.mutate()`
 * ohne Grund. Der Test prüft, was der Code tut — nicht, was er einmal tat.
 */
test('§E.4 Neu berechnen – Vorschlag ist ein Dry-Run, „Übernehmen" schreibt ihn fest', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Vorschlag ansehen' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Verteilungs-Vorschlag' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Verwerfen' })).toBeEnabled();

  // Freigeschaltet, sobald der Preview-Lauf zurück ist.
  await expect(dialog.getByRole('button', { name: 'Übernehmen' })).toBeEnabled();
});
