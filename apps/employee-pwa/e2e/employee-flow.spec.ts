import { test, expect, type Page } from '@playwright/test';

/**
 * Mitarbeiter-App E2E — two-phase bundle flow (COLLECT → PROCESS → DONE).
 *
 * Drives the seeded offline bundle (one Regal cart of three Belege, anchor
 * WE 3656860 with 5 positions). Verifies the redesign's load-bearing rules:
 *   1. COLLECT is a hard gate — PROCESS is locked until every pick-list stop is
 *      checked off (no scan required).
 *   2. PROCESS shows all positions at a glance; §G.2 forces price-label print
 *      before the carton opens; the minimum-quantity check is required for every
 *      position even though "Prüfung = Nein" (quantity_only); then per-Beleg
 *      erledigt → ZST.
 *
 * A screenshot is captured at each phase under e2e/screenshots/.
 */

const SHOT_DIR = 'e2e/screenshots';
const SEED_POSITIONS = 5;

// Mobile viewport — this is a phone-first PWA.
test.use({ viewport: { width: 390, height: 844 } });

/**
 * Wait for a screen heading. Screens read Dexie live queries; right after an SPA
 * transition the first emission can be missed under React StrictMode, leaving
 * the skeleton. The data is already in IndexedDB, so one reload re-subscribes.
 */
async function expectHeading(page: Page, name: string | RegExp): Promise<void> {
  const heading = page.getByRole('heading', { name });
  try {
    await heading.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    await page.reload();
    await heading.waitFor({ state: 'visible', timeout: 10_000 });
  }
}

async function loadSeeded(page: Page): Promise<void> {
  await page.goto('/');
  await expectHeading(page, /Guten Morgen/);
}

test.beforeEach(async ({ page }) => {
  await loadSeeded(page);
});

test('Home zeigt den zugeteilten Karren und sperrt Bearbeiten bis gesammelt', async ({
  page,
}) => {
  await expect(page.getByText(/Dein Karren · 3 Belege · Regal/)).toBeVisible();
  await expect(page.getByText(/Arbeitsplatz: Tisch 4/)).toBeVisible();
  // Collect not done → process is gated.
  await expect(page.getByText('Erst alle Plätze holen, dann bearbeiten.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sammeln starten' })).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/01-home-locked.png`, fullPage: true });

  // Hard gate: tapping a Beleg row must NOT navigate while collect is open.
  await page.getByText('WE 3656860', { exact: true }).click();
  await expect(page.getByRole('heading', { name: /Guten Morgen/ })).toBeVisible();
});

test('Kernfluss – COLLECT (Hard-Gate) → PROCESS → DONE', async ({ page }) => {
  // --- Phase 1: COLLECT --------------------------------------------------
  await page.getByRole('button', { name: 'Sammeln starten' }).click();
  await expectHeading(page, 'Plätze abholen');
  await expect(page.getByText('R27')).toBeVisible();
  await expect(page.getByText('A-4')).toBeVisible();
  // Finish is disabled until every stop is collected.
  await expect(page.getByRole('button', { name: /Noch .* offen/ })).toBeDisabled();
  await page.screenshot({ path: `${SHOT_DIR}/02-collect-open.png`, fullPage: true });

  // Check off both stops (tap the location rows).
  await page.getByText('R27').click();
  await page.getByText('A-4').click();
  const finishCollect = page.getByRole('button', { name: 'Sammeln fertig → Bearbeiten' });
  await expect(finishCollect).toBeEnabled();
  await page.screenshot({ path: `${SHOT_DIR}/03-collect-done.png`, fullPage: true });

  // Back to the hub — PROCESS is now unlocked.
  await finishCollect.click();
  await expectHeading(page, /Guten Morgen/);
  await expect(page.getByText('Alle Plätze geholt ✓')).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/04-home-unlocked.png`, fullPage: true });

  // --- Phase 2: PROCESS --------------------------------------------------
  await page.getByText('WE 3656860', { exact: true }).click();
  await expectHeading(page, 'Beleg bearbeiten');
  // All positions visible at a glance.
  await expect(page.getByText('Pos 1 ·')).toBeVisible();
  await expect(page.getByText('Pos 5 ·')).toBeVisible();
  // erledigt is gated (labels + min-qty open).
  await expect(page.getByRole('button', { name: 'Beleg erledigt' })).toBeDisabled();
  await page.screenshot({ path: `${SHOT_DIR}/05-process-open.png`, fullPage: true });

  // §G.2: carton stays disabled until labels are printed.
  await expect(page.getByRole('button', { name: 'Karton geöffnet' })).toBeDisabled();
  await page.getByRole('button', { name: 'Preisetiketten drucken' }).click();
  await expect(page.getByText('Preisetiketten gedruckt ✓')).toBeVisible();
  const carton = page.getByRole('button', { name: 'Karton geöffnet' });
  await expect(carton).toBeEnabled();
  await carton.click();
  await expect(page.getByText('Karton geöffnet ✓')).toBeVisible();

  // Minimum-quantity check for every position (required even "Prüfung = Nein").
  for (let i = 0; i < SEED_POSITIONS; i += 1) {
    await page.getByRole('button', { name: 'Stückzahl geprüft' }).first().click();
  }
  await expect(page.getByRole('button', { name: 'Stückzahl geprüft' })).toHaveCount(0);
  await page.screenshot({ path: `${SHOT_DIR}/06-process-ready.png`, fullPage: true });

  // --- DONE: per-Beleg erledigt → ZST -----------------------------------
  const erledigt = page.getByRole('button', { name: 'Beleg erledigt' });
  await expect(erledigt).toBeEnabled();
  await erledigt.click();
  await expectHeading(page, /Guten Morgen/);
  // The Beleg now reads as finished on the hub.
  await expect(page.getByText('1 von 3 fertig').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/07-beleg-done.png`, fullPage: true });
});

test('§G.5 erledigt bleibt gesperrt, solange ein Problem offen ist', async ({ page }) => {
  // Collect everything first.
  await page.getByRole('button', { name: 'Sammeln starten' }).click();
  await expectHeading(page, 'Plätze abholen');
  await page.getByText('R27').click();
  await page.getByText('A-4').click();
  await page.getByRole('button', { name: 'Sammeln fertig → Bearbeiten' }).click();

  await expectHeading(page, /Guten Morgen/);
  await page.getByText('WE 3656860', { exact: true }).click();
  await expectHeading(page, 'Beleg bearbeiten');

  // Satisfy labels + min-qty so only the open problem would block.
  await page.getByRole('button', { name: 'Preisetiketten drucken' }).click();
  for (let i = 0; i < SEED_POSITIONS; i += 1) {
    await page.getByRole('button', { name: 'Stückzahl geprüft' }).first().click();
  }
  await expect(page.getByRole('button', { name: 'Beleg erledigt' })).toBeEnabled();

  // Report a problem (scope + type) → erledigt must lock again.
  await page.getByRole('button', { name: 'Problem melden', exact: true }).click();
  await expectHeading(page, 'Problem melden');
  await page.getByLabel('Ebene').click();
  await page.getByRole('option', { name: 'Position' }).click();
  await page.getByRole('radio', { name: 'Minderlieferung' }).click();
  await page.getByRole('button', { name: 'An Teamlead senden' }).click();

  await expectHeading(page, 'Beleg bearbeiten');
  await expect(page.getByText(/Offenes Problem/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beleg erledigt' })).toBeDisabled();
  await page.screenshot({ path: `${SHOT_DIR}/08-problem-blocks.png`, fullPage: true });
});
