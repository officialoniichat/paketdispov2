import { test, expect, type Page } from '@playwright/test';
import { MA_101, MA_102 } from './fixtures/seed-data.js';

/**
 * Mitarbeiter-App E2E — real backend + real seeded Postgres (Task 16 of the
 * PIN-login SDD plan). Replaces the former offline/Dexie-demo-scenario suite,
 * which tested UI concepts (Tisch-Anmeldung, DEMO_SCENARIOS) that no longer
 * exist in the app (see commits e25b465 / 030d9f6: real PIN login +
 * `/api/me/today`).
 *
 * `e2e/fixtures/global-setup.ts` boots a real backend-api against a
 * Testcontainers Postgres and seeds two employees (`fixtures/seed-data.ts`),
 * each with their own bundle + Belege, so this suite proves actual
 * per-employee isolation end-to-end rather than against mocked data.
 *
 * Scope: a real login + home-screen render, the load-bearing C2 multi-employee
 * isolation check, a negative-auth check, and the A1 Positionen-Tabelle on the
 * PROCESS screen. This intentionally does not reproduce every assertion of the
 * old demo spec (printed labels, boxing, Teilabschluss, …) — those exercise UI
 * concepts that would need much richer seed data to test meaningfully.
 */

const GREETING = /Guten (Morgen|Tag|Abend)/;

/**
 * The fixed column headers of the Positionen-Tabelle, in order. The `Online`
 * column only exists because the seeded Beleg has an online-relevant position.
 */
const COLUMN_LABELS = [
  'Pos',
  'EAN',
  'Größe',
  'Online',
  'Soll',
  'Ist',
  'Mehr-/Mindermenge',
  'EK',
  'VK',
  'VK-Etikett',
];

/** The three right-aligned price columns — the whole point of A1. */
const PRICE_COLUMNS = ['EK', 'VK', 'VK-Etikett'];

// Login + Bündel-Home are a phone-first single column. The PROCESS screen is
// not: it targets the stationary 22–24" Touchdisplay at the Packtisch, so the
// Positionen-Tabelle block below overrides this viewport.
test.use({ viewport: { width: 390, height: 844 } });

async function loginAs(page: Page, employeeNo: string, pin: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Anmeldung' })).toBeVisible();
  await page.getByLabel('Mitarbeiternummer').fill(employeeNo);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

test.describe('Anmeldung + Bündel-Home (real backend)', () => {
  test('ma-101 logs in and sees their own seeded Belege + Lagerplatz', async ({ page }) => {
    await loginAs(page, MA_101.employeeNo, MA_101.pin);

    await expect(page.getByRole('heading', { name: GREETING })).toBeVisible();
    await expect(page.getByText(MA_101.displayName).first()).toBeVisible();

    for (const weBelegNo of MA_101.weBelegNos) {
      await expect(page.getByText(`WE ${weBelegNo}`, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText(MA_101.locationCode, { exact: false }).first()).toBeVisible();
  });

  test('wrong PIN is rejected and never reaches the home screen', async ({ page }) => {
    await loginAs(page, MA_101.employeeNo, '0000');

    await expect(
      page.getByText('Mitarbeiternummer oder PIN ist falsch.'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Anmeldung' })).toBeVisible();
    await expect(page.getByRole('heading', { name: GREETING })).not.toBeVisible();
  });

  // C2: two employees, two browser contexts — each must see ONLY their own
  // seeded data. This is the load-bearing assertion of this suite: it is not
  // enough that each page shows its own Belege, it must also NOT show the
  // other employee's.
  test('C2: ma-101 and ma-102 each see only their own bundle (multi-employee isolation)', async ({
    browser,
  }) => {
    const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await loginAs(pageA, MA_101.employeeNo, MA_101.pin);
      await loginAs(pageB, MA_102.employeeNo, MA_102.pin);

      await expect(pageA.getByRole('heading', { name: GREETING })).toBeVisible();
      await expect(pageB.getByRole('heading', { name: GREETING })).toBeVisible();

      // Own data present.
      await expect(
        pageA.getByText(`WE ${MA_101.weBelegNos[0]}`, { exact: false }).first(),
      ).toBeVisible();
      await expect(
        pageB.getByText(`WE ${MA_102.weBelegNos[0]}`, { exact: false }).first(),
      ).toBeVisible();

      // The other employee's data must be ABSENT — not just "not asserted".
      for (const weBelegNo of MA_102.weBelegNos) {
        await expect(pageA.getByText(`WE ${weBelegNo}`, { exact: false })).toHaveCount(0);
      }
      for (const weBelegNo of MA_101.weBelegNos) {
        await expect(pageB.getByText(`WE ${weBelegNo}`, { exact: false })).toHaveCount(0);
      }
      await expect(pageA.getByText(MA_102.locationCode, { exact: false })).toHaveCount(0);
      await expect(pageB.getByText(MA_101.locationCode, { exact: false })).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

/**
 * A1 — Positionen-Tabelle auf dem PROCESS-Screen. Zielgerät ist ein
 * stationärer 22–24"-Touchscreen am Packtisch (Dustin: „eher Richtung normaler
 * Bildschirm, 24, 22 Zoll"), nicht ein Mobilgerät — daher der Desktop-Viewport.
 */
test.describe('Positionen-Tabelle (22–24" Touchdisplay)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  /** „1 · Ware holen" gates „2 · Bearbeiten": collect the cart's only stop first. */
  async function openFirstBeleg(page: Page): Promise<void> {
    await loginAs(page, MA_101.employeeNo, MA_101.pin);
    await expect(page.getByRole('heading', { name: GREETING })).toBeVisible();

    // The Lagerplatz appears on the pick list first, then on the Beleg row.
    await page.getByText(MA_101.locationCode, { exact: true }).first().click();
    await expect(page.getByText('geholt')).toBeVisible();

    // Same for the WE-Nr.: a chip on the pick list, then the clickable Beleg row.
    await page.getByText(`WE ${MA_101.weBelegNos[0]}`, { exact: false }).last().click();
    await expect(page.getByRole('heading', { name: `WE ${MA_101.weBelegNos[0]}` })).toBeVisible();
  }

  /** Rows carrying Größen-values — the Position group-header rows have 2 cells, not 10. */
  function sizeRows(page: Page) {
    return page
      .getByRole('table', { name: 'Positionen' })
      .locator(`tbody tr:has(td:nth-child(${COLUMN_LABELS.length}))`);
  }

  test.beforeEach(async ({ page }) => {
    await openFirstBeleg(page);
  });

  test('rendert feste Spaltenüberschriften; jede Zeile trägt ihre Werte an derselben x-Position', async ({
    page,
  }) => {
    const table = page.getByRole('table', { name: 'Positionen' });
    await expect(table).toBeVisible();
    expect(await table.getByRole('columnheader').allInnerTexts()).toEqual(COLUMN_LABELS);

    // 3 Größen auf Pos 1 + 1 Größe auf Pos 2.
    await expect(sizeRows(page)).toHaveCount(4);

    // Preise stehen rechtsbündig und in JEDER Zeile an exakt derselben x-Position —
    // unabhängig davon, wie lang die Artikel-Identität der Position darüber ist.
    for (const label of PRICE_COLUMNS) {
      const index = COLUMN_LABELS.indexOf(label);
      const left = new Set<number>();
      const right = new Set<number>();
      for (let row = 0; row < 4; row++) {
        const cell = sizeRows(page).nth(row).locator('td').nth(index);
        await expect(cell).toHaveCSS('text-align', 'right');
        const box = await cell.boundingBox();
        expect(box, `${label}: Zeile ${row} muss gelayoutet sein`).not.toBeNull();
        left.add(Math.round(box!.x));
        right.add(Math.round(box!.x + box!.width));
      }
      expect(left.size, `${label}: identische linke Kante in allen Zeilen`).toBe(1);
      expect(right.size, `${label}: identische rechte Kante in allen Zeilen`).toBe(1);
    }

    // Die Preise landen in ihren eigenen Spalten, nicht mehr in einer Textzeile.
    const first = sizeRows(page).first();
    await expect(first.locator('td').nth(COLUMN_LABELS.indexOf('EK'))).toHaveText(/^12,50\s*€$/);
    await expect(first.locator('td').nth(COLUMN_LABELS.indexOf('VK'))).toHaveText(/^39,95\s*€$/);
    await expect(first.locator('td').nth(COLUMN_LABELS.indexOf('VK-Etikett'))).toHaveText(
      /^39,95\s*€$/,
    );
  });

  // Dustin: „wir haben rechts unfassbar viel Leerplatz." Beide Zielauflösungen.
  for (const { width, height } of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    test(`nutzt bei ${width}x${height} die rechte Bildhälfte`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });

      const vkLabel = page.getByRole('columnheader', { name: 'VK-Etikett', exact: true });
      await vkLabel.scrollIntoViewIfNeeded();
      const box = await vkLabel.boundingBox();
      expect(box).not.toBeNull();

      // Die Preisspalte beginnt jenseits der Bildmitte …
      expect(box!.x, 'VK-Etikett beginnt in der rechten Bildhälfte').toBeGreaterThan(width / 2);
      // … und reicht bis an den rechten Rand — genau der bislang leere Platz.
      expect(box!.x + box!.width, 'VK-Etikett reicht an den rechten Rand').toBeGreaterThan(
        width * 0.9,
      );

      // Sichtbarer Nachweis, nicht nur die Geometrie-Assertion oben. Bewusst der
      // Viewport und nicht `fullPage`: der fixierte Footer würde sonst mitten ins
      // Bild gerendert und verdeckte die Zeilen, die der Nachweis zeigen soll.
      const shot = testInfo.outputPath(`positionen-${width}x${height}.png`);
      await page.screenshot({ path: shot });
      await testInfo.attach(`positionen-${width}x${height}`, {
        path: shot,
        contentType: 'image/png',
      });
    });
  }

  test('bestehende Funktionen bleiben: Stepper, Online-Chip, Problem, Piktogramm, Touch-Ziele', async ({
    page,
  }) => {
    // Größe 36 ist die erste Zeile (SKU-Zeilen kommen nach EAN sortiert).
    const row = sizeRows(page).first();
    const plus = row.getByRole('button', { name: 'Größe 36: Menge erhöhen' });

    // Touch-Ziele bleiben ≥ 44 px, obwohl die Tabelle dichter ist (Handschuhe).
    const plusBox = await plus.boundingBox();
    expect(plusBox).not.toBeNull();
    expect(plusBox!.width).toBeGreaterThanOrEqual(44);
    expect(plusBox!.height).toBeGreaterThanOrEqual(44);

    // D2: +/- Mengen-Stepper erfasst die Mehrmenge in der Nachbarspalte.
    await expect(row.locator('td').nth(COLUMN_LABELS.indexOf('Ist'))).toContainText('3');
    await plus.click();
    await expect(row.locator('td').nth(COLUMN_LABELS.indexOf('Ist'))).toContainText('4');
    await expect(row.locator('td').nth(COLUMN_LABELS.indexOf('Mehr-/Mindermenge'))).toHaveText(
      '+1 Mehrmenge',
    );
    await row.getByRole('button', { name: 'Größe 36: Menge verringern' }).click();
    await row.getByRole('button', { name: 'Größe 36: Menge verringern' }).click();
    await expect(row.locator('td').nth(COLUMN_LABELS.indexOf('Mehr-/Mindermenge'))).toHaveText(
      '−1 Mindermenge',
    );

    // D4: Online-Markierung je Größe — 38 ist die bevorzugte Größe (grün), Rest rot.
    const online = COLUMN_LABELS.indexOf('Online');
    await expect(sizeRows(page).nth(1).locator('td').nth(online)).toHaveText(
      'Onlineartikel-Highlight',
    );
    await expect(sizeRows(page).nth(0).locator('td').nth(online)).toHaveText('Onlineartikel');
    // Pos 2 ist nicht online-relevant: die Zelle bleibt leer, die Spalte bleibt stehen.
    await expect(sizeRows(page).nth(3).locator('td').nth(online)).toBeEmpty();

    // C6: Sicherungs-Piktogramm, und je Position ein Problem- + Geprüft-Button.
    await expect(page.getByRole('img', { name: 'Hartetikett' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Problem', exact: true })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Position geprüft' })).toHaveCount(2);

    // D5: „Position geprüft" ist ein Toggle. In BEIDEN Zuständen bleibt es ein
    // Touch-Ziel >= 44 px — der geprüfte Zustand ist ein Chip, kein Button.
    const check = page.getByRole('button', { name: 'Position geprüft', exact: true }).first();
    const uncheckedBox = await check.boundingBox();
    expect(uncheckedBox!.height).toBeGreaterThanOrEqual(44);

    await check.click();
    const checked = page.getByRole('button', { name: 'Position geprüft ✓' });
    await expect(checked).toBeVisible();
    const checkedBox = await checked.boundingBox();
    expect(checkedBox!.height, 'Abwählen muss ebenso treffbar sein wie Anwählen').toBeGreaterThanOrEqual(
      44,
    );
  });
});
