import { test, expect, type Page } from '@playwright/test';

/**
 * Mitarbeiter-App E2E — Ein-Screen-Flow (Dustin-Feedback 03.07.2026).
 *
 * Drives the seeded offline bundle (mixed cart: Regal + Hängebahn + Palette,
 * anchor WE 3656860 with 5 positions). Verifies the load-bearing rules:
 *   1. Tisch-Anmeldung gates the app (A2).
 *   2. „Ware holen" is inline on the home screen and stays the hard gate (B1);
 *      „Rest parken" sends unfetched Belege back (B4).
 *   3. The Beleg screen shows the WE-Nr. as hero + Kartons (C1/C2); every
 *      position must be „Position geprüft" (toggleable, D5) before erledigt.
 *   4. An open problem blocks erledigt (§G.5); one clear continue path (D6).
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

const GREETING = /Guten (Morgen|Tag|Abend)/;

/** A2: claim the Tisch, then land on the seeded home. */
async function loginAndLoad(page: Page): Promise<void> {
  await page.goto('/');
  await expectHeading(page, 'Wo arbeitest du heute?');
  await page.getByLabel('Tisch-Nr.').fill('T-04');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expectHeading(page, GREETING);
}

/** D5: check every position („Position geprüft") of the open Beleg. */
async function checkAllPositions(page: Page, max = 8): Promise<void> {
  const buttons = page.getByRole('button', { name: 'Position geprüft', exact: true });
  for (let i = 0; i < max; i += 1) {
    const open = await buttons.count();
    if (open === 0) break;
    const next = buttons.first();
    await next.scrollIntoViewIfNeeded();
    await next.click();
    // Wait until the button became the ✓ chip before re-resolving the list.
    await expect(buttons).toHaveCount(open - 1, { timeout: 5000 });
  }
}

/** Check off every „Ware holen" stop of the default mixed bundle. */
async function collectAll(page: Page): Promise<void> {
  for (const code of ['HB-3', 'P-2', 'R27']) {
    // The code appears twice (stop row + Beleg row) — the stop renders first.
    await page.getByText(code, { exact: true }).first().click();
  }
}

test.beforeEach(async ({ page }) => {
  await loginAndLoad(page);
});

test('Tisch-Anmeldung + Home: ein Screen, Bearbeiten gesperrt bis geholt', async ({ page }) => {
  // A2: the claimed Arbeitsplatz is shown, not demo data.
  await expect(page.getByText('Arbeitsplatz: T-04')).toBeVisible();
  // Feedback: kein „Dein Karren · N Belege · Bereich"-Kopf mehr.
  await expect(page.getByText(/Dein Karren/)).toHaveCount(0);
  // A4: no effort-minutes estimate, no 'Heute erledigt' stat.
  await expect(page.getByText(/ca\. \d+ Min/)).toHaveCount(0);
  await expect(page.getByText(/Heute erledigt/)).toHaveCount(0);
  // B1: both sections live on ONE screen.
  await expect(page.getByText('1 · Ware holen')).toBeVisible();
  await expect(page.getByText('2 · Bearbeiten')).toBeVisible();
  // B3: Etiketten-Hinweis per Beleg at collect time.
  await expect(page.getByText(/🏷️ Etiketten drucken/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Erst Ware holen/ })).toBeDisabled();
  await page.screenshot({ path: `${SHOT_DIR}/01-home-locked.png`, fullPage: true });

  // Hard gate: tapping a Beleg row must NOT navigate while stops are open.
  await page.getByText('WE 3656860', { exact: true }).click();
  await expect(page.getByRole('heading', { name: GREETING })).toBeVisible();
});

test('Kernfluss – Ware holen (Hard-Gate) → Beleg → erledigt', async ({ page }) => {
  // --- Phase 1: Ware holen inline -----------------------------------------
  await collectAll(page);
  await expect(page.getByText('3/3 Plätze')).toBeVisible();
  const start = page.getByRole('button', { name: /Start Bearbeitung WE/ });
  await expect(start).toBeEnabled();
  await page.screenshot({ path: `${SHOT_DIR}/02-collected.png`, fullPage: true });

  // --- Phase 2: Beleg -------------------------------------------------------
  await page.getByText('WE 3656860', { exact: true }).click();
  // C1: the WE-Nr. is the hero heading (no 'Beleg bearbeiten' label).
  await expectHeading(page, 'WE 3656860');
  await expect(page.getByText('Beleg bearbeiten')).toHaveCount(0);
  // C2: Kartons statt Positionszahl.
  await expect(page.getByText(/3 Kartons – alle auf dem Karren suchen!/)).toBeVisible();
  await expect(page.getByText(/\d+ Positionen/)).toHaveCount(0);
  // C3: Warenart wording PROMINENT (chip) + Teile, no Abschnitt number.
  await expect(page.getByText('Vororder', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('9 Teile', { exact: true }).first()).toBeVisible();
  // C4: printing/carton are no work steps anymore.
  await expect(page.getByRole('button', { name: 'Preisetiketten drucken' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Karton geöffnet' })).toHaveCount(0);
  // C5: Prüfstufe explained on demand.
  await page.getByRole('button', { name: 'Was heißt das?' }).click();
  await expect(page.getByText(/Keine Wareneingangsprüfung\. Nur Mindestmengen-Check/)).toBeVisible();
  // D1: per-size lines with EAN + prices, always.
  await expect(page.getByText('EAN 4068657016108')).toBeVisible();
  await expect(page.getByText(/EK 14,20/).first()).toBeVisible();
  // D4: Online-Größen-Markierung rot/grün.
  await expect(page.getByText('Onlineartikel-Highlight').first()).toBeVisible();
  // D3: Shop + WGR-Klartext + Catman.
  await expect(page.getByText('Shop 2143').first()).toBeVisible();
  await expect(page.getByText(/WGR 218110 D-Bermuda/).first()).toBeVisible();
  await expect(page.getByText('Catman').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/03-beleg-open.png`, fullPage: true });

  // erledigt is gated on the position checks.
  await expect(page.getByRole('button', { name: 'Beleg erledigt' })).toBeDisabled();

  // D5: 'Position geprüft' is un-checkable — toggle one off and on again.
  await page.getByRole('button', { name: 'Position geprüft' }).first().click();
  await page.getByText('Position geprüft ✓').first().click();
  await expect(page.getByText('Position geprüft ✓')).toHaveCount(0);

  await checkAllPositions(page);
  await page.screenshot({ path: `${SHOT_DIR}/04-beleg-ready.png`, fullPage: true });

  // --- DONE: per-Beleg erledigt → ZST --------------------------------------
  const erledigt = page.getByRole('button', { name: 'Beleg erledigt' });
  await expect(erledigt).toBeEnabled();
  await erledigt.click();
  await expectHeading(page, GREETING);
  await expect(page.getByText('Fertig', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/05-beleg-done.png`, fullPage: true });
});

test('D2 Mehr-/Mindermengen per +/- an der Größe (kein Problem-Umweg)', async ({ page }) => {
  await collectAll(page);
  await page.getByText('WE 3656860', { exact: true }).click();
  await expectHeading(page, 'WE 3656860');

  // Minus at the first Größe records a Mindermenge inline.
  await page.getByRole('button', { name: 'Größe 8: Menge verringern' }).first().click();
  await expect(page.getByText('Mindermenge').first()).toBeVisible();
  // Plus back to Soll clears the deviation.
  await page.getByRole('button', { name: 'Größe 8: Menge erhöhen' }).first().click();
  await expect(page.getByText('Mindermenge')).toHaveCount(0);
  await page.screenshot({ path: `${SHOT_DIR}/06-mengen.png`, fullPage: true });
});

test('B4 Parkposition: Rest parken schickt ungeholte Belege zurück', async ({ page }) => {
  // Fetch only the first stop, then park the rest (2 Belege of 2 open stops).
  await page.getByText('HB-3', { exact: true }).first().click();
  const park = page.getByRole('button', { name: /Rest parken \(2 Belege\)/ });
  await expect(park).toBeVisible();
  await park.click();
  await expect(page.getByText(/2 Belege geparkt – kommen ins nächste Bündel/)).toBeVisible();
  // The cart shrank to the fetched Beleg; the parked ones are gone, collect is complete.
  await expect(page.getByText('WE 3656860', { exact: true })).toHaveCount(0);
  await expect(page.getByText('WE 3656861', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start Bearbeitung WE/ })).toBeEnabled();
  await page.screenshot({ path: `${SHOT_DIR}/07-geparkt.png`, fullPage: true });
});

test('D7 Teilabschluss zählt als Teilabschluss, nie als Fertig', async ({ page }) => {
  await collectAll(page);
  await page.getByText('WE 3656861', { exact: true }).click();
  await expectHeading(page, 'WE 3656861');
  await page.getByRole('button', { name: 'Teilabschluss' }).click();
  // D7: the dialog explains what happens to the Beleg.
  await expect(page.getByText(/kommt mit der Restware zurück in die Planung/)).toBeVisible();
  await page.getByLabel('Grund').fill('Karton beschädigt');
  await page.getByRole('button', { name: 'Teil abschließen' }).click();
  await expectHeading(page, GREETING);
  await expect(page.getByText('Teilabschluss', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Fertig', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${SHOT_DIR}/08-teilabschluss.png`, fullPage: true });
});

test('Demo: Belegset wechseln (dev-Flag) + Continuation', async ({ page }) => {
  // A1: the picker renders only because the e2e build sets VITE_DEMO_CONTROLS=1.
  await expect(page.getByText('Demo · Belegset')).toBeVisible();
  await page.getByLabel('Szenario').click();
  await page.getByRole('option', { name: /Hängeware/ }).click();
  await expect(page.getByText('HB-5', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/09-demo-haengeware.png`, fullPage: true });

  // Collect both stops → process both Belege to completion.
  await page.getByText('HB-3', { exact: true }).first().click();
  await page.getByText('HB-5', { exact: true }).first().click();
  for (const we of ['3700101', '3700102']) {
    await page.getByText(`WE ${we}`, { exact: true }).click();
    await expectHeading(page, `WE ${we}`);
    await checkAllPositions(page);
    const erledigt = page.getByRole('button', { name: 'Beleg erledigt' });
    await expect(erledigt).toBeEnabled();
    await erledigt.click();
    await expectHeading(page, GREETING);
  }

  // Continuation panel replaces the dead-end; pull cycles the demo Belegset.
  await expect(page.getByText(/Bündel fertig/)).toBeVisible();
  const holen = page.getByRole('button', { name: 'Nächstes Bündel holen' });
  await holen.click();
  // Cycles to the Großbündel Belegset (Regal locations R3/R12/A-7).
  await expect(page.getByText('R3', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/10-continuation.png`, fullPage: true });
});

test('§G.5 erledigt bleibt gesperrt, solange ein Problem offen ist', async ({ page }) => {
  await collectAll(page);
  await page.getByText('WE 3656860', { exact: true }).click();
  await expectHeading(page, 'WE 3656860');

  // Satisfy the position checks so only the open problem would block.
  await checkAllPositions(page);
  await expect(page.getByRole('button', { name: 'Beleg erledigt' })).toBeEnabled();

  // Report a problem FROM a position (per-position scope) → erledigt must lock again.
  await page.getByRole('button', { name: 'Problem', exact: true }).first().click();
  await expectHeading(page, 'Problem melden');
  await expect(page.getByText(/Position 1/)).toBeVisible(); // target pre-selected
  // D6: no 'ganzer Beleg' escape, no quantity types, one continue path.
  await expect(page.getByRole('button', { name: 'Stattdessen ganzer Beleg' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restware weiter bearbeiten' })).toHaveCount(0);
  await page.getByLabel('Problemart').click();
  await expect(page.getByRole('option', { name: 'Minderlieferung' })).toHaveCount(0); // → D2 +/- statt Problem
  await page.getByRole('option', { name: 'falscher Artikel' }).click();
  await page.getByRole('button', { name: 'An Teamlead senden' }).click();

  await expectHeading(page, 'WE 3656860');
  await expect(page.getByText(/Offenes Problem/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beleg erledigt' })).toBeDisabled();
  await page.screenshot({ path: `${SHOT_DIR}/11-problem-blocks.png`, fullPage: true });
});
