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
 * isolation check, and a negative-auth check. This intentionally does not
 * reproduce every assertion of the old demo spec (printed labels, boxing,
 * Teilabschluss, …) — those exercise UI concepts that would need much richer
 * seed data to test meaningfully, and are not the point of this task.
 */

const GREETING = /Guten (Morgen|Tag|Abend)/;

// Mobile viewport — this is a phone-first PWA.
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
