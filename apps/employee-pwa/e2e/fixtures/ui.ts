/**
 * Gemeinsame UI-Helfer der Mitarbeiter-App-Specs (`employee-flow.spec.ts`,
 * `warenauszeichnung.spec.ts`): Login, die Stop-Zeilen aus „1 · Ware holen"
 * und das Öffnen eines Belegs über seine Zeile in „2 · Bearbeiten".
 */
import { expect, type Locator, type Page } from '@playwright/test';

export const GREETING = /Guten (Morgen|Tag|Abend)/;

export async function loginAs(page: Page, employeeNo: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Anmeldung' })).toBeVisible();
  await page.getByLabel('Mitarbeiternummer').fill(employeeNo);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

export async function loginAndWaitForHome(page: Page, employeeNo: string): Promise<void> {
  await loginAs(page, employeeNo);
  await expect(page.getByRole('heading', { name: GREETING })).toBeVisible();
}

/**
 * Die Stop-Zeilen aus „1 · Ware holen". Anker ist der klein geschriebene
 * Status-Chip der Zeile („offen"/„geholt"); die Beleg-Zeilen in „2 · Bearbeiten"
 * tragen einen groß geschriebenen Chip („Offen"), werden also nicht mitgefangen.
 */
export function stopRows(page: Page): Locator {
  return page.locator('.MuiPaper-root').filter({ has: page.getByText(/^(offen|geholt)$/) });
}

/**
 * Hakt eine Stop-Zeile ab/auf — als Nutzer-Klick auf ihren Status-Chip
 * („offen"/„geholt") statt blind auf die Zeilenmitte: dort stehen seit dem
 * Kundenfeedback 15.07.2026 die Beleg-Infos samt „Barcode anzeigen"-Button,
 * und der Button toggelt bewusst NICHT (stopPropagation).
 */
export async function toggleStop(row: Locator): Promise<void> {
  await row.getByText(/^(offen|geholt)$/).click();
}

/**
 * Die Beleg-Zeile aus „2 · Bearbeiten" zu einer WE-Nummer — so, wie ein
 * Mitarbeiter sie anklickt. Einen Footer-„Start Bearbeitung"-Button gibt es
 * seit dem Kundenfeedback 2026-07-14 nicht mehr: jeder geholte Beleg ist
 * direkt über seine Zeile startbar.
 */
export function belegRow(page: Page, weBelegNo: string): Locator {
  return page
    .locator('.MuiPaper-root')
    .filter({ hasText: `WE ${weBelegNo}` })
    .filter({ hasNot: page.getByText(/^(offen|geholt)$/) });
}

/** Öffnet den Beleg über seine Zeile (Klick auf die WE-Nr, nicht den Barcode-Button). */
export async function openBeleg(page: Page, weBelegNo: string): Promise<void> {
  await belegRow(page, weBelegNo).getByText(`WE ${weBelegNo}`).click();
  await expect(page.getByRole('heading', { name: `WE ${weBelegNo}` })).toBeVisible();
}
