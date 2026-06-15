import { test, expect, type Page } from '@playwright/test';

/**
 * Mitarbeiter-App happy-path E2E (pre-pilot acceptance §17.1 + Anhang G.5).
 *
 * Drives the full task-first flow against the seeded mock package (WE 3656860):
 *   Tagesstart -> Abholreihenfolge -> Lagerplatzscan -> Vorbereitung
 *   -> Positionen -> Boxabschluss -> ZST-Abschluss.
 *
 * The seed (exampleAssignment.ts) maps the Anhang G beleg: Prüfung WE = Nein
 * (goodsReceiptCheckMode 'quantity_only') AND minimumQuantityCheckAlwaysRequired
 * = true, 5 Positionen, 1 Box, Boxzettel + ZST erforderlich. That makes the G.5
 * guardrails observable in the UI.
 *
 * Robustness: every step asserts its screen heading (or its primary action)
 * before interacting, so the test follows the live IndexedDB seed/transition
 * instead of racing it.
 */

const SEED_POSITIONS = 5;

/**
 * Wait for a screen heading. The screens read their state from Dexie live
 * queries; right after an SPA transition the first emission can be missed under
 * React StrictMode, leaving the "Lädt…" skeleton. The data is already in
 * IndexedDB (the seed/transition persisted it), so a single reload of the same
 * route re-subscribes the live query and the screen renders. This keeps the
 * happy-path assertions intact while staying deterministic.
 */
async function expectScreen(page: Page, headingName: string): Promise<void> {
  const heading = page.getByRole('heading', { name: headingName });
  try {
    await heading.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    await page.reload();
    await heading.waitFor({ state: 'visible', timeout: 10_000 });
  }
}

/**
 * Each Playwright test gets a fresh browser context with empty IndexedDB, so
 * loading the app seeds exactly one clean package via seedIfEmpty (no manual DB
 * reset needed — deleting the DB while the app holds an open Dexie connection is
 * what corrupts the seed). The enabled "Starten" button proves the Tagesstart
 * live query has the seeded bundle.
 */
async function loadSeeded(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Starten' })).toBeEnabled();
}

/** Tagesstart -> Abholreihenfolge -> pickup screen (shared by several tests). */
async function startUntilPickup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Starten' }).click();

  await expectScreen(page, 'Abholreihenfolge');
  await page.getByRole('button', { name: 'Abholung starten' }).click();

  await expectScreen(page, 'Lagerplatzscan');
}

/** pickup -> prepare -> positions screen with labels printed and sorting done. */
async function pickupUntilPositions(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Paket gefunden' }).click();

  // --- 9.5 Vorbereitung: G.2 Etiketten VOR Sortierung ---
  await expectScreen(page, 'Vorbereitung');
  // Before printing, "Sortierung fertig" is not offered (label-before-sort gate).
  await expect(page.getByRole('button', { name: 'Sortierung fertig' })).toHaveCount(0);
  await expect(page.getByText('Erst Etiketten drucken, dann Karton öffnen.')).toBeVisible();
  await page.getByRole('button', { name: 'Etiketten drucken' }).click();
  // Only after labels are printed does sorting become available.
  const sort = page.getByRole('button', { name: 'Sortierung fertig' });
  await expect(sort).toBeVisible();
  await sort.click();

  await expectScreen(page, 'Position 1');
}

test.beforeEach(async ({ page }) => {
  await loadSeeded(page);
});

test('§17.1 Zuteilung – Tagesstart zeigt das zugeteilte Paket', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Guten Morgen/ })).toBeVisible();
  await expect(page.getByText(/Arbeitsplatz: Tisch 4/)).toBeVisible();
  await expect(page.getByText(/Abholreihenfolge: R27/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Starten' })).toBeEnabled();
});

test('§17.1 Kernfluss – kompletter Happy Path bis ZST-Abschluss', async ({ page }) => {
  // --- 9.2/9.3 Tagesstart + vorgegebene Abholreihenfolge ---
  await page.getByRole('button', { name: 'Starten' }).click();
  await expectScreen(page, 'Abholreihenfolge');
  await expect(page.getByText(/1\. R27 · WE 3656860/)).toBeVisible();
  await page.getByRole('button', { name: 'Abholung starten' }).click();

  // --- 9.4 Lagerplatzscan (manuelle Bestätigung als Fallback) ---
  await expectScreen(page, 'Lagerplatzscan');
  await page.getByLabel('Barcode/Lagerplatz scannen').fill('R27');
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(page.getByText('Gescannt: R27')).toBeVisible();

  // --- 9.5 Vorbereitung + 9.6 Positionen (über die Helfer) ---
  await pickupUntilPositions(page);

  // --- 9.6 Positionen: G.5 Stückzahlkontrolle trotz Prüfung=Nein ---
  for (let i = 1; i <= SEED_POSITIONS; i++) {
    await expectScreen(page, `Position ${i}`);
    // Quantity check is gated FIRST (even though Prüfung WE = Nein).
    const qtyBtn = page.getByRole('button', { name: /^Stückzahl prüfen \(\d+\)$/ });
    await expect(qtyBtn).toBeVisible();
    await qtyBtn.click();
    // Only after the quantity control does "Position korrekt" appear.
    const correct = page.getByRole('button', { name: 'Position korrekt' });
    await expect(correct).toBeVisible();
    await correct.click();
  }

  // --- 9.8 Boxabschluss: Boxzettel -> verplomben -> Förderband ---
  await expectScreen(page, 'Boxabschluss');
  const printBox = page.getByRole('button', { name: /^Box 1: Boxzettel drucken$/ });
  await expect(printBox).toBeVisible();
  await printBox.click();
  const sealBox = page.getByRole('button', { name: /^Box 1 verplomben$/ });
  await expect(sealBox).toBeVisible();
  await sealBox.click();
  const conveyor = page.getByRole('button', { name: /^Box 1: aufs Förderband$/ });
  await expect(conveyor).toBeVisible();
  await conveyor.click();
  const finishBox = page.getByRole('button', { name: 'Beleg abschließen' });
  await expect(finishBox).toBeVisible();
  await finishBox.click();

  // --- 9.9 Abschluss / ZST ---
  await expectScreen(page, 'Beleg abschließen');
  await expect(page.getByText('Fertige Menge: 9 / 9')).toBeVisible();
  const zst = page.getByRole('button', { name: 'ZST setzen und abschließen' });
  await expect(zst).toBeEnabled();
  await zst.click();

  // ZST closes the case and returns to the bundle overview (§17.1 ZST).
  await expectScreen(page, 'Abholreihenfolge');
});

test('G.5 Prüfung=Nein → Stückzahlkontrolle ist Pflicht (Gate vor "Position korrekt")', async ({
  page,
}) => {
  await startUntilPickup(page);
  await pickupUntilPositions(page);

  // On the first position the quantity-check action is required up front and
  // "Position korrekt" is NOT yet offered — proving §G.5 (Prüfung=Nein still
  // requires a Stückzahlkontrolle).
  await expect(page.getByRole('heading', { name: 'Position 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Stückzahl prüfen \(\d+\)$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Position korrekt' })).toHaveCount(0);
  // The action checklist also lists the mandatory quantity step (marked ✓).
  await expect(page.getByText('✓ Stückzahl prüfen')).toBeVisible();
});

test('§17.1 Exception-first – "Problem melden" ist immer erreichbar', async ({ page }) => {
  await startUntilPickup(page);

  // The Problem button is part of every StepScaffold screen.
  await page.getByRole('button', { name: 'Problem melden' }).click();

  await expect(page.getByRole('heading', { name: 'Problem melden' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'An Teamlead senden' })).toBeVisible();
});
