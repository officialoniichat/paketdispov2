/**
 * Belegsuche über das Nummern-Mittelstück.
 *
 * Dustin: „Könnte ich auch nur das Mittelstück eingeben, 0-0-3-0-5?"
 *
 * Die Suche im Zuweisen-Dialog muss einen Beleg über eine Teilzeichenkette aus
 * der MITTE der WE-Nummer finden. Sie tut das bereits über `contains` +
 * `mode: 'insensitive'` (`apps/backend-api/src/cases/case-search.ts:36-40`);
 * dieser Test sichert es ab, damit niemand versehentlich auf eine Prefix-Suche
 * (`startsWith`) zurückbaut — die Dustins Eingabe stillschweigend ins Leere
 * laufen ließe.
 *
 * Die WE-Nummern des Seeds haben die Form `3.540.310`; das „Mittelstück" ist
 * hier entsprechend ein Ausschnitt, der weder am Anfang noch am Ende steht.
 */
import { test, expect } from './fixtures/test.js';
import { bearer, DEMO_PIN, login, TEAMLEAD_NO } from './fixtures/auth.js';
import { BACKEND_URL } from './fixtures/ports.js';

/** Mitarbeiterin mit genau EINEM Bereich — der Dialog verengt die Suche darauf. */
const EMPLOYEE_NAME = 'Anna Berger';
const EMPLOYEE_BEREICH = 'Hängebahn';

interface SearchResult {
  caseId: string;
  weBelegNo: string;
}

async function searchAssignable(token: string, params: string): Promise<SearchResult[]> {
  const res = await fetch(`${BACKEND_URL}/api/teamlead/cases/search?${params}`, {
    headers: bearer(token),
  });
  const body = await res.text();
  expect(res.ok, `GET /api/teamlead/cases/search → HTTP ${res.status}: ${body}`).toBe(true);
  return JSON.parse(body) as SearchResult[];
}

/** Ein echtes Mittelstück: schneidet vorn UND hinten etwas ab. */
function middleOf(weBelegNo: string): string {
  const middle = weBelegNo.slice(2, 7);
  expect(weBelegNo.startsWith(middle), `„${middle}" wäre ein Prefix von ${weBelegNo}`).toBe(false);
  expect(weBelegNo.endsWith(middle), `„${middle}" wäre ein Suffix von ${weBelegNo}`).toBe(false);
  return middle;
}

test('Belegsuche (Dustin: „nur das Mittelstück, 0-0-3-0-5?"): die API findet den Beleg über eine Teilzeichenkette aus der Mitte, nicht nur über den Präfix', async () => {
  const token = await login(TEAMLEAD_NO, DEMO_PIN);

  const pool = await searchAssignable(
    token,
    `bereich=${encodeURIComponent(EMPLOYEE_BEREICH)}&limit=8`,
  );
  expect(pool.length, 'Der zuweisbare Pool ist leer — Seed/Recalculate prüfen.').toBeGreaterThan(0);

  const target = pool[0];
  const middle = middleOf(target.weBelegNo);

  const hits = await searchAssignable(
    token,
    `q=${encodeURIComponent(middle)}&bereich=${encodeURIComponent(EMPLOYEE_BEREICH)}&limit=8`,
  );

  expect(hits.map((h) => h.weBelegNo)).toContain(target.weBelegNo);
});

test('Belegsuche (Dustin: „nur das Mittelstück, 0-0-3-0-5?"): der Zuweisen-Dialog schlägt den Beleg zum Mittelstück vor', async ({
  page,
}) => {
  const token = await login(TEAMLEAD_NO, DEMO_PIN);
  const pool = await searchAssignable(
    token,
    `bereich=${encodeURIComponent(EMPLOYEE_BEREICH)}&limit=8`,
  );
  expect(pool.length, 'Der zuweisbare Pool ist leer — Seed/Recalculate prüfen.').toBeGreaterThan(0);

  const target = pool[0];
  const middle = middleOf(target.weBelegNo);

  await page.goto('/board');
  // Die Zeile ist ein Accordion; der Dialog steckt in den Details.
  await page.getByRole('button', { name: new RegExp(EMPLOYEE_NAME) }).first().click();
  await page
    .getByRole('button', { name: /Bündel anlegen|Beleg\(e\) zuweisen/ })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('WE-Belegnummer').fill(middle);

  // Die Live-Suche ist entprellt (350 ms) und blendet die Trefferliste erst ein,
  // wenn die Anfrage zurück ist.
  await expect(dialog.getByText(target.weBelegNo, { exact: true })).toBeVisible();
});
