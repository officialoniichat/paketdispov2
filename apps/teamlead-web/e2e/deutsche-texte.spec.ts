/**
 * Keine englischen Texte — Evas deutlichste Beschwerde:
 * „Ich möchte euch bitten, alles auf Deutsch zu machen."
 *
 * Geprüft über alle Hauptansichten (Tagescockpit, Belege, Digitale Ablagen,
 * Mitarbeiterboard, Admin & Regelpflege inkl. der sechs Regel-Tabs):
 *
 *  1. keine englischen Wortmarken im sichtbaren Text,
 *  2. keine roh gerenderten Enum-Schlüssel (`snake_case` / `SCREAMING_SNAKE`),
 *  3. Datums- und Zahlenformate in de-DE,
 *  4. Fehlermeldungen auf Deutsch (Ursprung: `src/data/http.ts:31`).
 *
 * `DevScenariosTab` ist ausgenommen: `AdminPage.tsx:46-51` schaltet den lazy
 * `import()` in einem Production-Build statisch weg — die Suite baut über
 * `pnpm build`, der Tab existiert im getesteten Bundle also gar nicht.
 */
import { test, expect, type Page } from './fixtures/test.js';

/** Englische Wortmarken, die im Fließtext nichts zu suchen haben. */
const ENGLISH_WORD_MARKS = [
  /\bRetry\b/,
  /\bSave\b/,
  /\bCancel\b/,
  /\bLoading\b/,
  /\bError\b/,
  /\bSubmit\b/,
];

/** „Search"/„Filter" nur als Button-Beschriftung verboten — als Substantiv nicht. */
const ENGLISH_BUTTON_LABELS = /^(Search|Filter|Submit|Save|Cancel|Retry)$/;

const MAIN_VIEWS = [
  { path: '/', name: 'Tagescockpit', ready: /Automatik-Dispo/ },
  { path: '/belege', name: 'Belege', ready: /^Belege \(/ },
  { path: '/ablagen', name: 'Digitale Ablagen', ready: /^Digitale Ablagen$/ },
  { path: '/board', name: 'Mitarbeiterboard', ready: /^Mitarbeiterboard$/ },
] as const;

/** Die sechs Regel-Tabs, die Eva täglich benutzt. */
const RULE_TABS = ['Priorität', 'Bündel', 'Aufwand', 'Lieferungen', 'Verladeplan', 'Schichtende'];

/**
 * Roh gerenderte Enum-Schlüssel: ein Token, das komplett `snake_case` oder
 * `SCREAMING_SNAKE` ist. Tokenweise geprüft, damit URLs oder Fließtext mit
 * Unterstrich keine Fehlalarme auslösen.
 */
function rawEnumTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu, ''))
    .filter((t) => /^[a-z]+(_[a-z]+)+$/.test(t) || /^[A-Z]{2,}(_[A-Z]{2,})+$/.test(t));
}

async function visibleText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

/** Prüft eine gerenderte Ansicht gegen 1. + 2. */
async function expectGermanOnly(page: Page, where: string): Promise<void> {
  const text = await visibleText(page);

  for (const mark of ENGLISH_WORD_MARKS) {
    expect(text, `${where}: englische Wortmarke ${mark} im sichtbaren Text`).not.toMatch(mark);
  }

  expect(rawEnumTokens(text), `${where}: roher Enum-Schlüssel im sichtbaren Text`).toEqual([]);

  const buttonLabels = await page.getByRole('button').allInnerTexts();
  const englishButtons = buttonLabels
    .map((l) => l.trim())
    .filter((l) => ENGLISH_BUTTON_LABELS.test(l));
  expect(englishButtons, `${where}: englische Button-Beschriftung`).toEqual([]);
}

for (const view of MAIN_VIEWS) {
  test(`Deutsche Texte (Eva: „alles auf Deutsch"): ${view.name} zeigt keine englischen Wortmarken und keine rohen Enum-Schlüssel`, async ({
    page,
  }) => {
    await page.goto(view.path);
    await expect(page.getByText(view.ready).first()).toBeVisible();

    await expectGermanOnly(page, view.name);
  });
}

test('Deutsche Texte (Eva: „Ich meine bei den Admin-Regeln"): alle sechs Regel-Tabs zeigen keine englischen Wortmarken und keine rohen Enum-Schlüssel', async ({
  page,
}) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin & Regelpflege' })).toBeVisible();

  for (const tab of RULE_TABS) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Regeln speichern' })).toBeVisible();

    await expectGermanOnly(page, `Admin-Tab „${tab}"`);
  }
});

test('Deutsche Texte (Eva: „alles auf Deutsch"): Datums- und Zahlenformate sind de-DE', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText(/Automatik-Dispo/)).toBeVisible();

  const cockpit = await visibleText(page);
  // 10.07.2026 statt 2026-07-10 oder 07/10/2026.
  expect(cockpit, 'Tagescockpit zeigt kein de-DE-Datum (TT.MM.JJJJ)').toMatch(
    /\b\d{2}\.\d{2}\.\d{4}\b/,
  );
  // Prozent mit Leerzeichen („4 %"), wie `formatPct` es erzeugt.
  expect(cockpit, 'Prozentwert ohne de-DE-Leerzeichen vor dem %').toMatch(/\d\s%/);

  for (const view of MAIN_VIEWS) {
    await page.goto(view.path);
    await expect(page.getByText(view.ready).first()).toBeVisible();
    const text = await visibleText(page);

    expect(text, `${view.name}: ISO-Datum im sichtbaren Text`).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    expect(text, `${view.name}: US-Datum im sichtbaren Text`).not.toMatch(
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
    );
    // In de-DE trennt das Komma Dezimalstellen — „1,234" wäre ein US-Tausender.
    expect(text, `${view.name}: US-Tausendertrennzeichen`).not.toMatch(/\d,\d{3}\b/);
  }
});

/**
 * Dezimalzahlen mit Punkt statt Komma. Vor dem Vergleich werden die Muster
 * entfernt, in denen ein Punkt in de-DE korrekt ist: Datum („10.07.2026"),
 * WE-Belegnummern („3.540.310"), Paragraphen („§8.4") und Tausenderpunkte.
 */
function decimalPointNumbers(text: string): string[] {
  const withoutLegitimateDots = text
    .replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, ' ') // 10.07.2026
    .replace(/\b\d{1,2}\.\d{1,2}\.(?!\d)/g, ' ') // 15.06.
    .replace(/\b\d\.\d{3}\.\d{3}\b/g, ' ') // 3.540.310
    .replace(/§\s?\d+(\.\d+)*/g, ' ') // §8.4
    .replace(/\b\d{1,3}(\.\d{3})+\b/g, ' '); // 1.234 (Tausenderpunkt)
  return withoutLegitimateDots.match(/\b\d+\.\d{1,2}\b(?!\d)/g) ?? [];
}

test('Deutsche Texte (Eva: „alles auf Deutsch"): Dezimalzahlen benutzen das Komma, nicht den Punkt', async ({
  page,
}) => {
  // Grün — deckt aber NICHT den offenen Befund B1 des Berichts ab:
  // `MitarbeiterBoard.tsx:221` rendert `{row.plannedHours} h geplant` roh und
  // zeigt „7.5 h" nur, wenn die Stundenzahl überhaupt gebrochen ist (im
  // aktuellen Seed nicht); `EmployeeDetailPanel.tsx:280` (`toFixed(2)`) liegt
  // im Admin-Tab „Mitarbeiter", nicht in den sechs Regel-Tabs. Beide bleiben
  // ungeprüft, bis sie auf `formatNumber` (de-DE) umgestellt sind.
  for (const view of MAIN_VIEWS) {
    await page.goto(view.path);
    await expect(page.getByText(view.ready).first()).toBeVisible();

    const found = decimalPointNumbers(await visibleText(page));
    expect(found, `${view.name}: Dezimalzahl mit Punkt statt Komma`).toEqual([]);
  }
});

test('Deutsche Texte (Ursprung http.ts:31): eine fehlgeschlagene Backend-Abfrage meldet sich auf Deutsch', async ({
  page,
}) => {
  // Backend für genau diese Abfrage unerreichbar machen.
  await page.route('**/api/admin/rules', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Regeln nicht verfügbar' }),
    }),
  );

  await page.goto('/admin');

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Regeln konnten nicht geladen werden');
  await expect(alert).toContainText('Laden der Regeln fehlgeschlagen');

  // Der alte Wortlaut war „Backend request failed: rules (…)".
  const message = await alert.innerText();
  expect(message, 'Fehlermeldung enthält englischen Text').not.toMatch(/failed|error|request/i);
});
