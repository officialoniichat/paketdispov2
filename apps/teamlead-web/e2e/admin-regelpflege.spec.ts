/**
 * Admin & Regelpflege — jeder Tab speichert ohne Fehler (Eva arbeitet täglich hier).
 *
 * Regressionsschutz für den Bug, bei dem die globale NestJS-ValidationPipe
 * (`whitelist: true`, `apps/backend-api/src/main.ts:26`) DTO-Felder OHNE
 * class-validator-Dekorator still verwarf. Der Body kam beschnitten im Service an,
 * die Zod-Validierung schlug fehl → HTTP 400 „Ungültige Regelkonfiguration".
 *
 * Jeder Test ist deshalb ein ROUNDTRIP: Wert ändern → speichern → HTTP-Status der
 * PUT-Antwort prüfen → Seite neu laden → Wert muss wirklich persistiert sein.
 * Ein grüner Toast ohne Persistenz ist genau der alte Bug; der Toast allein
 * beweist nichts.
 *
 * Alle sechs Tabs teilen sich EINEN „Regeln speichern"-Button und damit einen
 * einzigen `PUT /api/admin/rules` — betroffen war entsprechend jeder Tab.
 */
import { test, expect, type Page } from './fixtures/test.js';

/** Öffnet /admin, wartet bis die Regeln geladen sind, und wechselt auf den Tab. */
async function openTab(page: Page, tab: string): Promise<void> {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin & Regelpflege' })).toBeVisible();
  await page.getByRole('tab', { name: tab, exact: true }).click();
  // Der Speichern-Button erscheint erst, wenn `draft` aus dem Backend steht.
  await expect(page.getByRole('button', { name: 'Regeln speichern' })).toBeVisible();
}

/**
 * Klickt „Regeln speichern" und prüft den HTTP-Status der PUT-Antwort — nicht nur
 * den Toast. Genau hier schlug der alte Bug mit 400 fehl.
 */
async function saveRules(page: Page): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes('/api/admin/rules'),
    ),
    page.getByRole('button', { name: 'Regeln speichern' }).click(),
  ]);

  expect(response.status(), await response.text()).toBe(200);
  await expect(page.getByText('Regeln gespeichert.')).toBeVisible();
  await expect(page.getByText(/Speichern fehlgeschlagen/)).toHaveCount(0);
}

/** Setzt ein Eingabefeld, speichert, lädt neu und beweist die Persistenz. */
async function roundtripField(page: Page, tab: string, label: string, value: string): Promise<void> {
  await openTab(page, tab);
  await page.getByLabel(label, { exact: true }).first().fill(value);
  await saveRules(page);

  await openTab(page, tab);
  await expect(page.getByLabel(label, { exact: true }).first()).toHaveValue(value);
}

/**
 * Kippt einen Schalter, speichert, lädt neu und beweist die Persistenz.
 * Kein `exact`: der Schalter-Labeltext trägt zusätzlich den ⓘ-Marker
 * (`aria-label="Erklärung"`, AdminPage.tsx `InfoHint`), gehört also nicht exakt
 * dem reinen Feldnamen.
 */
async function roundtripToggle(page: Page, tab: string, label: string): Promise<void> {
  await openTab(page, tab);
  const toggle = page.getByLabel(label).first();
  const before = await toggle.isChecked();
  await toggle.setChecked(!before);
  await saveRules(page);

  await openTab(page, tab);
  await expect(page.getByLabel(label).first()).toBeChecked({ checked: !before });
}

test('Admin & Regelpflege (Eva, täglich): Tab „Priorität" speichert und persistiert', async ({
  page,
}) => {
  await roundtripToggle(page, 'Priorität', 'FIFO aktiv');
});

test('Admin & Regelpflege (Eva, täglich): Tab „Bündel" speichert und persistiert', async ({
  page,
}) => {
  await roundtripField(page, 'Bündel', 'Monster-Beleg-Schwelle (Teile)', '777');
});

test('Admin & Regelpflege (Eva, täglich): Tab „Aufwand" speichert und persistiert', async ({
  page,
}) => {
  // Der Aufwand-Tab trägt `handlingClassFactors` + `wgrFactors` — die beiden
  // freien Number-Maps, die die ValidationPipe ohne @Allow() stillschweigend
  // entfernt hätte. Dieser Roundtrip ist der eigentliche Wächter.
  await roundtripField(page, 'Aufwand', 'Grundzeit je Beleg', '7.5');
});

test('Admin & Regelpflege (Eva, täglich): Tab „Lieferungen" speichert und persistiert', async ({
  page,
}) => {
  await roundtripField(page, 'Lieferungen', 'Max. Beleg-Abstand', '3');
});

test('Admin & Regelpflege (Eva, täglich): Tab „Verladeplan" speichert und persistiert', async ({
  page,
}) => {
  // „Sondertag" ist ein Chip ohne Checked-Zustand; „Gültig ab" ist das echte,
  // persistierte `loadPlan`-Feld (RuleConfigDto.loadPlan[].validFrom, YYYY-MM-DD).
  await roundtripField(page, 'Verladeplan', 'Gültig ab', '2026-08-01');
});

test('Admin & Regelpflege (Eva, täglich): Tab „Schichtende" speichert und persistiert', async ({
  page,
}) => {
  await roundtripField(page, 'Schichtende', 'Auto-Stopp vor Schichtende (Min.)', '45');
});
