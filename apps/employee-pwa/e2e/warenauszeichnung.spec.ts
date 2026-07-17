import { test, expect, type Locator, type Page } from '@playwright/test';
import { MA_101, belegNos } from './fixtures/seed-data.js';
import { loginAndWaitForHome, openBeleg, stopRows } from './fixtures/ui.js';

/**
 * Warenauszeichnung — Positions-/SKU-Bearbeitung (Kundenfeedback 15.07.2026):
 *
 * 1. Etikettpreis: ein erfasster Wert erscheint als Betrag mit €-Zeichen
 *    („40" → „40,00 €"), nicht als blanke Zahl.
 * 2. Gemeldete Probleme sind auf Positions-/Größenebene farblich markiert —
 *    konsistent zur bestehenden Markierung von Mehr-/Mindermenge und
 *    Etikettpreis-Abweichung (rote Zeile).
 * 3. Ein Problem OHNE gewählte Größe („Ganze Position") markiert die gesamte
 *    Position rot — Kopfzeile und alle Größenzeilen.
 *
 * Läuft wie `employee-flow.spec.ts` gegen das echte Backend + geseedetes
 * Postgres. Alle Aktionen bleiben lokal (kein Teilabschluss) — der
 * Serverzustand anderer Tests wird nicht verändert. Die Problemarten
 * („beschädigt", „falscher Artikel") kommen aus dem Startkatalog der Migration
 * `20260715152533_problem_workflow_rework`.
 */

/** Rote Problem-Markierung der Tabelle (PROBLEM_ROW_SX in BelegProcessScreen). */
const PROBLEM_BG = 'rgba(211, 47, 47, 0.08)';

/** Spaltenzahl der Positionen-Tabelle von WE-E2E-101-1 (mit Online-Spalte). */
const COLUMN_COUNT = 11;

// Der PROCESS-Screen zielt auf das stationäre 22–24"-Touchdisplay am Packtisch.
test.use({ viewport: { width: 1920, height: 1080 } });

/** „1 · Ware holen" sperrt „2 · Bearbeiten": erst den einzigen Stop abhaken. */
async function openFirstBeleg(page: Page): Promise<void> {
  await loginAndWaitForHome(page, MA_101.employeeNo);
  await stopRows(page).first().click();
  await expect(stopRows(page).first().getByText('geholt', { exact: true })).toBeVisible();
  await openBeleg(page, belegNos(MA_101)[0]);
}

/** Größen-Zeilen (36, 38, 40, 32) — die Positions-Kopfzeilen haben 2 Zellen, nicht 11. */
function sizeRows(page: Page): Locator {
  return page
    .getByRole('table', { name: 'Positionen' })
    .locator(`tbody tr:has(td:nth-child(${COLUMN_COUNT}))`);
}

/** Die Kopfzeile einer Position („Pos 1"/„Pos 2") mit Artikel, Chips und Problem-Button. */
function positionHeaderRow(page: Page, positionNo: number): Locator {
  return page
    .getByRole('table', { name: 'Positionen' })
    .locator('tbody tr')
    .filter({ has: page.getByText(`Pos ${positionNo}`, { exact: true }) });
}

/** Meldet im Problem-Dialog von Pos 1 ein Problem; `sizeOption` wählt die Größe (optional). */
async function reportProblem(page: Page, reason: string, sizeOption?: string): Promise<void> {
  await page.getByRole('button', { name: 'Problem', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Problem melden – Position 1' })).toBeVisible();
  await page.getByRole('combobox', { name: /Problemart/ }).click();
  await page.getByRole('option', { name: reason }).click();
  if (sizeOption !== undefined) {
    await page.getByRole('combobox', { name: 'Größe (optional)' }).click();
    await page.getByRole('option', { name: sizeOption }).click();
  }
  await page.getByRole('button', { name: 'Problem erfassen' }).click();
  await expect(page.getByRole('heading', { name: /Problem melden/ })).not.toBeVisible();
}

test.describe('Warenauszeichnung — Etikettpreis & Problem-Markierung', () => {
  test('Etikettpreis: ein erfasster Wert erscheint als Betrag mit €-Zeichen („40,00 €"), nicht als blanke Zahl', async ({
    page,
  }) => {
    await openFirstBeleg(page);
    const rows = sizeRows(page);
    const etikettpreisCell = (row: number): Locator => rows.nth(row).locator('td').last();

    // Ausgangslage Größe 36: leeres Feld — Platzhalter „Preis" MIT permanentem €.
    const input36 = page.getByLabel('Größe 36: Etikettpreis erfassen');
    await expect(input36).toHaveValue('');
    await expect(input36).toHaveAttribute('placeholder', 'Preis');
    await expect(etikettpreisCell(0).getByText('€')).toBeVisible();

    // „40" eintippen: das €-Zeichen steht schon während der Eingabe hinter der Zahl.
    await input36.fill('40');
    await expect(input36).toHaveValue('40');
    await expect(etikettpreisCell(0).getByText('€')).toBeVisible();

    // Fokus verlassen: der Wert wird als deutscher Betrag formatiert — „40,00 €".
    await input36.blur();
    await expect(input36).toHaveValue('40,00');
    await expect(etikettpreisCell(0).getByText('€')).toBeVisible();

    // Komma-Eingabe funktioniert genauso: „38,50" bleibt „38,50 €".
    const input40 = page.getByLabel('Größe 40: Etikettpreis erfassen');
    await input40.fill('38,50');
    await input40.blur();
    await expect(input40).toHaveValue('38,50');
    await expect(etikettpreisCell(2).getByText('€')).toBeVisible();

    // Die Preisabweichung markiert die Zeilen weiterhin rot (bestehendes Verhalten).
    await expect(rows.nth(0)).toHaveCSS('background-color', PROBLEM_BG);
    await expect(rows.nth(2)).toHaveCSS('background-color', PROBLEM_BG);

    // Leeren nimmt Betrag und Markierung weg — das €-Zeichen bleibt stehen.
    await input36.fill('');
    await input36.blur();
    await expect(input36).toHaveValue('');
    await expect(etikettpreisCell(0).getByText('€')).toBeVisible();
    await expect(rows.nth(0)).not.toHaveCSS('background-color', PROBLEM_BG);
  });

  test('Problem MIT Größe: die gewählte Größenzeile wird rot markiert; Entfernen hebt die Markierung auf', async ({
    page,
  }) => {
    await openFirstBeleg(page);
    const rows = sizeRows(page);

    // Vorher: keine Zeile trägt die Problem-Markierung.
    for (const row of [0, 1, 2, 3]) {
      await expect(rows.nth(row)).not.toHaveCSS('background-color', PROBLEM_BG);
    }

    await reportProblem(page, 'beschädigt', '38 · 4001234500028');

    // Genau die gemeldete Größenzeile (38) ist rot markiert …
    await expect(rows.nth(1)).toHaveCSS('background-color', PROBLEM_BG);
    for (const other of [0, 2, 3]) {
      await expect(rows.nth(other)).not.toHaveCSS('background-color', PROBLEM_BG);
    }

    // … die Positions-Kopfzeile zeigt das Problem als Chip, bleibt selbst aber
    // unmarkiert (das Problem betrifft nur die eine Größe).
    await expect(positionHeaderRow(page, 1).getByText('beschädigt')).toBeVisible();
    await expect(positionHeaderRow(page, 1)).not.toHaveCSS('background-color', PROBLEM_BG);

    // Problem über das Chip-X wieder entfernen → die Markierung verschwindet.
    await positionHeaderRow(page, 1).getByTestId('CancelIcon').click();
    await expect(positionHeaderRow(page, 1).getByText('beschädigt')).toHaveCount(0);
    await expect(rows.nth(1)).not.toHaveCSS('background-color', PROBLEM_BG);
  });

  test('Problem OHNE Größe („Ganze Position"): die gesamte Position wird rot markiert', async ({
    page,
  }) => {
    await openFirstBeleg(page);
    const rows = sizeRows(page);

    // Größe bewusst NICHT wählen — die Vorgabe des Dialogs ist „Ganze Position".
    await reportProblem(page, 'falscher Artikel');

    // Kopfzeile UND alle drei Größenzeilen von Pos 1 sind rot markiert …
    await expect(positionHeaderRow(page, 1)).toHaveCSS('background-color', PROBLEM_BG);
    for (const row of [0, 1, 2]) {
      await expect(rows.nth(row)).toHaveCSS('background-color', PROBLEM_BG);
    }

    // … Pos 2 bleibt vollständig unmarkiert.
    await expect(positionHeaderRow(page, 2)).not.toHaveCSS('background-color', PROBLEM_BG);
    await expect(rows.nth(3)).not.toHaveCSS('background-color', PROBLEM_BG);
  });
});
