import { test, expect, type Locator, type Page } from '@playwright/test';
import { BACKEND_PORT } from './fixtures/ports.js';
import {
  MA_101,
  MA_102,
  MA_103,
  MA_104,
  MA_105,
  MA_106,
  UNKNOWN_EMPLOYEE_NO,
  belegNos,
  locationCodes,
} from './fixtures/seed-data.js';
import {
  GREETING,
  belegRow,
  loginAs,
  loginAndWaitForHome,
  openBeleg,
  stopRows,
  toggleStop,
} from './fixtures/ui.js';

/**
 * Mitarbeiter-App E2E — echtes Backend, echtes geseedetes Postgres.
 *
 * Jeder Test trägt im Namen die Kundenforderung aus dem Call vom 07.07.2026,
 * die er absichert. `e2e/fixtures/global-setup.ts` bootet ein reales backend-api
 * gegen ein Testcontainers-Postgres und seedet sechs Mitarbeiter
 * (`fixtures/seed-data.ts`) mit je eigenem Bündel.
 *
 * KEIN `recalculate` im Setup: der Seed schreibt die Bündel direkt und legt keine
 * `Shift`-Zeilen an — `recalculate` würde die Bündel löschen (siehe seed.ts).
 *
 * NICHT getestet (bekannt und dokumentiert): der Abhak-Zustand von „Ware holen"
 * ist rein lokal (BundleHomeScreen.tsx:128-137). Ein Reload verliert ihn. Ein
 * Persistenz-Test würde zu Recht fehlschlagen.
 */

const API_BASE = `http://localhost:${BACKEND_PORT}`;

/** Die festen Spaltenüberschriften der Positionen-Tabelle, in Reihenfolge. */
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
  'Etikettpreis',
];

/** Die drei rechtsbündigen Preisspalten — Dustins ausdrückliche Bedingung. */
const PRICE_COLUMNS = ['EK', 'VK', 'VK-Etikett'];

/** Mindesthöhe eines Touch-Ziels am Packtisch (Handschuhe). */
const MIN_TOUCH_TARGET_PX = 44;

// Login + Bündel-Home sind eine Phone-first-Spalte. Der PROCESS-Screen nicht:
// er zielt auf das stationäre 22–24"-Touchdisplay am Packtisch.
test.use({ viewport: { width: 390, height: 844 } });

/** Serverzustand — bewusst am UI und am React-Query-Cache vorbei. */
async function fetchBundleFromBackend(
  page: Page,
): Promise<{ bundleId: string | null; weBelegNos: string[] }> {
  const raw = await page.evaluate(() => localStorage.getItem('paket.session'));
  expect(raw, 'Nach dem Login muss eine Session im localStorage liegen').not.toBeNull();
  const { token } = JSON.parse(raw!) as { token: string };

  const response = await page.request.get(`${API_BASE}/api/me/today`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status(), 'GET /api/me/today').toBe(200);

  const body = (await response.json()) as {
    bundle: { bundleId: string } | null;
    cases: { weBelegNo: string }[];
  };
  return {
    bundleId: body.bundle?.bundleId ?? null,
    weBelegNos: body.cases.map((c) => c.weBelegNo),
  };
}

/* ------------------------------------------------------------------------- *
 * Forderung 1 — Anmeldung ohne PIN
 * Dustin: „Deswegen kann es ohne PIN laufen."
 * ------------------------------------------------------------------------- */
test.describe('Forderung 1 — Anmeldung ohne PIN (Dustin)', () => {
  test('Forderung 1 (Login ohne PIN): der Anmelde-Screen zeigt überhaupt kein PIN-Feld', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Anmeldung' })).toBeVisible();

    await expect(page.getByLabel('PIN')).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('Forderung 1 (Login ohne PIN): die Mitarbeiternummer allein führt in die App', async ({
    page,
  }) => {
    await loginAndWaitForHome(page, MA_101.employeeNo);

    await expect(page.getByText(MA_101.displayName).first()).toBeVisible();
    for (const weBelegNo of belegNos(MA_101)) {
      await expect(page.getByText(`WE ${weBelegNo}`, { exact: false }).first()).toBeVisible();
    }
  });

  test('Forderung 1 (Login ohne PIN): eine unbekannte Mitarbeiternummer wird abgelehnt', async ({
    page,
  }) => {
    await loginAs(page, UNKNOWN_EMPLOYEE_NO);

    await expect(page.getByText('Mitarbeiternummer ist unbekannt.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Anmeldung' })).toBeVisible();
    await expect(page.getByRole('heading', { name: GREETING })).not.toBeVisible();
  });
});

/* ------------------------------------------------------------------------- *
 * Forderungen 2–5 — „Ware holen" auf dem Bündel-Home
 * ------------------------------------------------------------------------- */
test.describe('Forderungen 2–5 — Ware holen', () => {
  test('Forderung 2 (Ware holen): jeder Stop zeigt seinen Lagerplatz', async ({ page }) => {
    await loginAndWaitForHome(page, MA_103.employeeNo);

    const rows = stopRows(page);
    await expect(rows).toHaveCount(MA_103.stops.length);

    // B7: Lagerplatz 1:1 aus der Arbeitsanweisung, keine Transformation.
    for (const [index, locationCode] of locationCodes(MA_103).entries()) {
      await expect(rows.nth(index)).toContainText(locationCode);
    }
  });

  test('Forderung 3 (Ware holen): Stops abhaken macht die zugehörigen Belege startbar — ohne Zwangsreihenfolge', async ({
    page,
  }) => {
    await loginAndWaitForHome(page, MA_103.employeeNo);
    const rows = stopRows(page);
    const total = MA_103.stops.length;

    // Ausgangslage: nichts geholt — die Belege sind ausgegraut, aber ein weiteres
    // Bündel ließe sich jederzeit anfordern (kein „Erst Ware holen"-Sperrknopf mehr).
    await expect(page.getByText(`0/${total} Plätze`)).toBeVisible();
    await expect(page.getByText(/Ausgegraute Belege erst holen/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Weiteres Bündel anfordern' })).toBeEnabled();

    // Die Stop-Zeile ist klickbar und schaltet von „offen" auf „geholt".
    for (let index = 0; index < total; index++) {
      await expect(rows.nth(index).getByText('offen', { exact: true })).toBeVisible();
      await toggleStop(rows.nth(index));
      await expect(rows.nth(index).getByText('geholt', { exact: true })).toBeVisible();
      await expect(page.getByText(`${index + 1}/${total} Plätze`)).toBeVisible();
    }

    // Nach dem letzten Haken verschwindet der Hinweis …
    await expect(page.getByText(/Ausgegraute Belege erst holen/)).toHaveCount(0);

    // … und jeder Beleg ist direkt über seine Zeile startbar.
    await openBeleg(page, belegNos(MA_103)[0]);
  });

  test('Forderung 4 (Rest parken): parkt die restlichen Belege — serverseitig verifiziert', async ({
    page,
  }) => {
    await loginAndWaitForHome(page, MA_104.employeeNo);
    const rows = stopRows(page);
    const [beleg1, beleg2, beleg3] = belegNos(MA_104);
    const parkButton = page.getByRole('button', { name: /^Rest parken/ });

    // Ausgangslage serverseitig: alle drei Belege hängen im Bündel.
    const before = await fetchBundleFromBackend(page);
    expect(before.bundleId).not.toBeNull();
    expect([...before.weBelegNos].sort()).toEqual([beleg1, beleg2, beleg3].sort());

    // Der Button erscheint erst, wenn mindestens ein Stop geholt ist (:350).
    await expect(parkButton).toHaveCount(0);

    await toggleStop(rows.nth(0));
    await expect(page.getByRole('button', { name: 'Rest parken (2 Belege)' })).toBeVisible();

    await toggleStop(rows.nth(1));
    await expect(page.getByRole('button', { name: 'Rest parken (1 Beleg)' })).toBeVisible();

    // … und verschwindet wieder, sobald nichts mehr offen ist.
    await toggleStop(rows.nth(2));
    await expect(parkButton).toHaveCount(0);

    // Dustins Szenario: der Karren ist voll, der letzte Platz bleibt liegen.
    await toggleStop(rows.nth(2));
    await expect(page.getByRole('button', { name: 'Rest parken (1 Beleg)' })).toBeVisible();
    await page.getByRole('button', { name: 'Rest parken (1 Beleg)' }).click();

    await expect(page.getByText('1 Beleg geparkt – kommen ins nächste Bündel.')).toBeVisible();

    // Der eigentliche Nachweis: das Backend hat den Beleg aus dem Bündel gelöst.
    // POST /api/me/park ist der einzige Ware-holen-Pfad, der wirklich schreibt.
    const after = await fetchBundleFromBackend(page);
    expect(after.bundleId).toBe(before.bundleId);
    expect([...after.weBelegNos].sort()).toEqual([beleg1, beleg2].sort());
    expect(after.weBelegNos).not.toContain(beleg3);
  });

  test('Forderung 5 + Punkt 1 (15.07.2026): jeder Beleg zeigt am Stop seine Kopf-Infos — Etiketten-Art, Filiale/Shopbereich, Warenart', async ({
    page,
  }) => {
    await loginAndWaitForHome(page, MA_101.employeeNo);
    const [mitEtiketten, ohneEtiketten] = belegNos(MA_101);

    // Beide Belege liegen auf demselben Lagerplatz. Der Stop-Text wird an den
    // WE-Nummern in die beiden Beleg-Einträge zerlegt, damit jede Info dem
    // RICHTIGEN Beleg zugeordnet ist — nicht bloß „irgendwo am Stop".
    const stopText = await stopRows(page).first().innerText();
    const startMit = stopText.indexOf(`WE ${mitEtiketten}`);
    const startOhne = stopText.indexOf(`WE ${ohneEtiketten}`);
    expect(startMit, 'Beleg MIT Etikettendruck steht auf der Liste').toBeGreaterThanOrEqual(0);
    expect(startOhne, 'Beleg OHNE Etikettendruck folgt (Engine-Reihenfolge)').toBeGreaterThan(
      startMit,
    );
    const eintragMit = stopText.slice(startMit, startOhne);
    const eintragOhne = stopText.slice(startOhne);

    // Etiketten-Art wie in „2 · Bearbeiten": Druckpflicht vs. digital bleibt am
    // Stop unterscheidbar — Dustin sieht weiter, ob er zum Drucker muss (F5).
    expect(eintragMit).toContain('🏷️ Etikettendruck');
    expect(eintragMit).not.toContain('Digitale Etiketten');
    expect(eintragOhne).toContain('Digitale Etiketten');
    expect(eintragOhne).not.toContain('🏷️');

    // Filiale · Shopbereich und Warenart je Beleg (Punkt 1).
    // EINE Zeile je Beleg, Blöcke mit „|" getrennt (Nachtrag 17.07.2026).
    expect(eintragMit).toContain('Filiale 1 · Shopbereich 42 | 🏷️ Etikettendruck');
    expect(eintragMit).toContain('Vororder');
    expect(eintragOhne).toContain('Filiale 1 · Shopbereich 77 | Digitale Etiketten');
    expect(eintragOhne).toContain('NOS');

    // … und unter „2 · Bearbeiten" stehen dieselben Infos unverändert.
    await expect(belegRow(page, mitEtiketten)).toContainText(
      'Filiale 1 · Shopbereich 42 | 🏷️ Etikettendruck',
    );
    await expect(belegRow(page, ohneEtiketten)).toContainText(
      'Filiale 1 · Shopbereich 77 | Digitale Etiketten',
    );
  });

  test('Punkt 2 (15.07.2026): „Barcode anzeigen" sitzt beim Ware holen — und ist bei „2 · Bearbeiten" ersatzlos entfernt', async ({
    page,
  }) => {
    await loginAndWaitForHome(page, MA_101.employeeNo);
    const stop = stopRows(page).first();
    const [ersterBeleg] = belegNos(MA_101);

    // Je Beleg des Stops ein Button (MA_101: zwei Belege auf einem Platz) …
    await expect(stop.getByRole('button', { name: 'Barcode anzeigen' })).toHaveCount(2);
    // … und auf den Beleg-Zeilen in „2 · Bearbeiten" KEINER mehr.
    for (const weBelegNo of belegNos(MA_101)) {
      await expect(
        belegRow(page, weBelegNo).getByRole('button', { name: 'Barcode anzeigen' }),
      ).toHaveCount(0);
    }

    // Der Klick öffnet das Code-128-Pop-up des RICHTIGEN Belegs …
    await stop.getByRole('button', { name: 'Barcode anzeigen' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: `WE ${ersterBeleg}` })).toBeVisible();
    await expect(dialog.getByRole('img', { name: `Barcode ${ersterBeleg}` })).toBeVisible();
    await dialog.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // … und hakt den Stop dabei NICHT als „geholt" ab (stopPropagation).
    await expect(stop.getByText('offen', { exact: true })).toBeVisible();
  });
});

/* ------------------------------------------------------------------------- *
 * Beleg-Reihenfolge — die Liste folgt der Engine-Sequenz und springt nicht
 * ------------------------------------------------------------------------- */
test.describe('Beleg-Reihenfolge', () => {
  test('die Belege kommen in der Reihenfolge der assignment-engine, nicht in der des Buchungsdatums', async ({
    page,
  }) => {
    // ma-105 ist so geseedet, dass die Engine-Sequenz der Einfügereihenfolge
    // WIDERSPRICHT: 105-2 trägt Sequenz 1. Sortierte `/api/me/today` weiter nach
    // `bookingDate` (beide Belege: heute), stünde 105-1 vorn — und die
    // Beleg-Liste spränge, sobald eine Zeile geschrieben wurde.
    const [zweiterInDerEngine, ersterInDerEngine] = belegNos(MA_105);

    await loginAndWaitForHome(page, MA_105.employeeNo);

    // Serverseitig: die Engine-Sequenz gewinnt.
    expect((await fetchBundleFromBackend(page)).weBelegNos).toEqual([
      ersterInDerEngine,
      zweiterInDerEngine,
    ]);

    await toggleStop(stopRows(page).first());

    // Auch nachdem eine Zeile geschrieben wurde (`start-preparation`), bleibt es dabei.
    await openBeleg(page, ersterInDerEngine);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: GREETING })).toBeVisible();

    expect((await fetchBundleFromBackend(page)).weBelegNos).toEqual([
      ersterInDerEngine,
      zweiterInDerEngine,
    ]);
  });
});

/* ------------------------------------------------------------------------- *
 * Kundenfeedback 15.07.2026, Punkt 3 — Problemfälle immer ganz unten
 * ------------------------------------------------------------------------- */
test.describe('Kundenfeedback 15.07.2026, Punkt 3 — Problemfälle ganz unten', () => {
  /** Die Beleg-Zeilen aus „2 · Bearbeiten" in DOM-Reihenfolge (ohne Stop-Zeilen). */
  function bearbeitenRows(page: Page): Locator {
    return page
      .locator('.MuiPaper-root')
      .filter({ hasText: /WE WE-E2E-/ })
      .filter({ hasNot: page.getByText(/^(offen|geholt)$/) });
  }

  test('ein „Problem gemeldet"-Beleg steht unter dem letzten Beleg — obwohl die Engine ihn zuerst liefert', async ({
    page,
  }) => {
    const [problemfall, zweiter, dritter] = belegNos(MA_106);
    await loginAndWaitForHome(page, MA_106.employeeNo);

    // Ware holen abhaken: so ist der Problemfall unten NICHT bloß „noch nicht
    // geholt", sondern ausschließlich durch seinen Status gesperrt.
    await toggleStop(stopRows(page).first());

    // Serverseitig steht der Problemfall VORN (Engine-Sequenz 1): die Absenkung
    // ist reine Anzeige-Regel, keine Umordnung der Engine-Entscheidung.
    expect((await fetchBundleFromBackend(page)).weBelegNos).toEqual([
      problemfall,
      zweiter,
      dritter,
    ]);

    const rows = bearbeitenRows(page);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(`WE ${zweiter}`);
    await expect(rows.nth(1)).toContainText(`WE ${dritter}`);
    // Ganz unten: der Problemfall, samt Status-Chip und Sperr-Hinweis.
    await expect(rows.nth(2)).toContainText(`WE ${problemfall}`);
    await expect(rows.nth(2)).toContainText('Problem gemeldet');
    await expect(rows.nth(2)).toContainText(
      'Wartet auf Klärung durch die Teamleitung – nicht bearbeitbar.',
    );

    // Gesperrt heißt gesperrt: der Klick auf den Problemfall öffnet KEINEN Beleg.
    await rows.nth(2).getByText(`WE ${problemfall}`).click();
    await expect(page.getByRole('heading', { name: GREETING })).toBeVisible();
    await expect(page.getByRole('heading', { name: `WE ${problemfall}` })).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------------- *
 * Mitarbeiter-Trennung — bestehender, tragender Regressionsschutz (C2)
 * ------------------------------------------------------------------------- */
test.describe('Mitarbeiter-Trennung', () => {
  test('C2: ma-101 und ma-102 sehen jeweils nur ihr eigenes Bündel', async ({ browser }) => {
    const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await loginAndWaitForHome(pageA, MA_101.employeeNo);
      await loginAndWaitForHome(pageB, MA_102.employeeNo);

      await expect(
        pageA.getByText(`WE ${belegNos(MA_101)[0]}`, { exact: false }).first(),
      ).toBeVisible();
      await expect(
        pageB.getByText(`WE ${belegNos(MA_102)[0]}`, { exact: false }).first(),
      ).toBeVisible();

      // Die Daten des jeweils anderen müssen ABWESEND sein — nicht bloß „nicht geprüft".
      for (const weBelegNo of belegNos(MA_102)) {
        await expect(pageA.getByText(`WE ${weBelegNo}`, { exact: false })).toHaveCount(0);
      }
      for (const weBelegNo of belegNos(MA_101)) {
        await expect(pageB.getByText(`WE ${weBelegNo}`, { exact: false })).toHaveCount(0);
      }
      await expect(pageA.getByText(locationCodes(MA_102)[0], { exact: false })).toHaveCount(0);
      await expect(pageB.getByText(locationCodes(MA_101)[0], { exact: false })).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

/* ------------------------------------------------------------------------- *
 * Forderungen 6–8 — Beleg-Detail auf dem 22–24" Touchdisplay
 * Dustin: „eher Richtung normaler Bildschirm, 24, 22 Zoll"
 * ------------------------------------------------------------------------- */
test.describe('Forderungen 6–8 — Beleg-Detail (22–24" Touchdisplay)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  /** „1 · Ware holen" sperrt „2 · Bearbeiten": erst den einzigen Stop abhaken. */
  async function openFirstBeleg(page: Page): Promise<void> {
    await loginAndWaitForHome(page, MA_101.employeeNo);
    await toggleStop(stopRows(page).first());
    await expect(stopRows(page).first().getByText('geholt', { exact: true })).toBeVisible();
    await openBeleg(page, belegNos(MA_101)[0]);
  }

  /** Zeilen mit Größen-Werten — die Positions-Kopfzeilen haben 2 Zellen, nicht 10. */
  function sizeRows(page: Page): Locator {
    return page
      .getByRole('table', { name: 'Positionen' })
      .locator(`tbody tr:has(td:nth-child(${COLUMN_LABELS.length}))`);
  }

  test('Forderung 6 (Positionen-Tabelle): feste Spalten, Preise rechts der Größe, gleiche x-Position je Zeile', async ({
    page,
  }) => {
    await openFirstBeleg(page);

    const table = page.getByRole('table', { name: 'Positionen' });
    await expect(table).toBeVisible();
    expect(await table.getByRole('columnheader').allInnerTexts()).toEqual(COLUMN_LABELS);

    // 3 Größen auf Pos 1 + 1 Größe auf Pos 2.
    await expect(sizeRows(page)).toHaveCount(4);

    // Dustins Bedingung: die Preisspalten liegen RECHTS der Größenspalte.
    // Geprüft an den x-Koordinaten, nicht an der DOM-Reihenfolge.
    const groesse = await page
      .getByRole('columnheader', { name: 'Größe', exact: true })
      .boundingBox();
    expect(groesse, 'Größenspalte muss gelayoutet sein').not.toBeNull();
    for (const label of PRICE_COLUMNS) {
      const price = await page
        .getByRole('columnheader', { name: label, exact: true })
        .boundingBox();
      expect(price, `${label}: Spalte muss gelayoutet sein`).not.toBeNull();
      expect(
        price!.x,
        `${label} muss rechts der Größenspalte liegen (x=${price!.x}, Größe endet bei ${groesse!.x + groesse!.width})`,
      ).toBeGreaterThan(groesse!.x + groesse!.width);
    }

    // „dass die Positionen immer an der gleichen Stelle stehen": jede Zeile trägt
    // ihre Preise an exakt derselben x-Position — unabhängig von der Artikel-
    // Identität der Position darüber.
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
    test(`Forderung 6 (Positionen-Tabelle): nutzt bei ${width}x${height} die rechte Bildhälfte`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height });
      await openFirstBeleg(page);

      // Seit Punkt 4 ist „Etikettpreis" die rechteste Spalte (hinter VK-Etikett).
      const etikettpreis = page.getByRole('columnheader', { name: 'Etikettpreis', exact: true });
      await etikettpreis.scrollIntoViewIfNeeded();
      const box = await etikettpreis.boundingBox();
      expect(box, 'Etikettpreis muss gelayoutet sein').not.toBeNull();

      // Die rechteste Spalte beginnt jenseits der Bildmitte …
      expect(box!.x, 'Etikettpreis beginnt in der rechten Bildhälfte').toBeGreaterThan(width / 2);
      // … und reicht bis an den rechten Rand — genau der bislang leere Platz.
      expect(box!.x + box!.width, 'Etikettpreis reicht an den rechten Rand').toBeGreaterThan(
        width * 0.9,
      );

      // Sichtbarer Nachweis als Artefakt, nicht nur die Geometrie-Assertion oben.
      // Bewusst der Viewport und nicht `fullPage`: der fixierte Footer würde sonst
      // mitten ins Bild gerendert und verdeckte die Zeilen, die er zeigen soll.
      const shot = testInfo.outputPath(`positionen-${width}x${height}.png`);
      await page.screenshot({ path: shot });
      await testInfo.attach(`positionen-${width}x${height}`, {
        path: shot,
        contentType: 'image/png',
      });
    });
  }

  test('Forderung 6 (Positionen-Tabelle): Mengen-Stepper und Problem-Button sind mindestens 44px hoch', async ({
    page,
  }) => {
    await openFirstBeleg(page);
    const row = sizeRows(page).first();

    // Größe 36 ist die erste Zeile (SKU-Zeilen kommen nach EAN sortiert).
    for (const name of ['Größe 36: Menge erhöhen', 'Größe 36: Menge verringern']) {
      const box = await row.getByRole('button', { name }).boundingBox();
      expect(box, `${name}: muss gelayoutet sein`).not.toBeNull();
      expect(box!.width, `${name}: Breite`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      expect(box!.height, `${name}: Höhe`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    }

    const problem = await page
      .getByRole('button', { name: 'Problem', exact: true })
      .first()
      .boundingBox();
    expect(problem, 'Problem-Button muss gelayoutet sein').not.toBeNull();
    expect(problem!.height, 'Problem-Button: Höhe').toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);

    // „Position geprüft" ist ein Toggle. In BEIDEN Zuständen bleibt es ein
    // Touch-Ziel ≥ 44 px — der geprüfte Zustand ist ein Chip, kein Button.
    const check = page.getByRole('button', { name: 'Position geprüft', exact: true }).first();
    expect((await check.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    await check.click();
    const checked = page.getByRole('button', { name: 'Position geprüft ✓' });
    await expect(checked).toBeVisible();
    expect(
      (await checked.boundingBox())!.height,
      'Abwählen muss ebenso treffbar sein wie Anwählen',
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  test('Forderung 7 (Sicherungs-Piktogramm): das SVG lädt wirklich (200, image/svg+xml)', async ({
    page,
  }) => {
    // Die Netzwerkantwort zählt, nicht das bloße Vorhandensein des <img>-Elements:
    // Dustin hielt das Piktogramm fälschlich für fehlend. Listener VOR der
    // Navigation registrieren, sonst ist die Antwort schon durch.
    const pictogramResponses: { url: string; status: number; contentType: string }[] = [];
    page.on('response', (response) => {
      if (!response.url().includes('/static/pictograms/')) return;
      pictogramResponses.push({
        url: response.url(),
        status: response.status(),
        contentType: response.headers()['content-type'] ?? '',
      });
    });

    await openFirstBeleg(page);

    // Seit ab8ae6b ist das Piktogramm die Illustration der Arbeitsschritt-Karte
    // „Sichern: Hartetikett" (alt="", also ohne eigenen Accessible Name) — die
    // Karte trägt den Text, das <img> wird über seine SVG-Quelle gefunden.
    await expect(page.getByText('Sichern: Hartetikett')).toBeVisible();
    const img = page.locator('img[src$="/static/pictograms/hard-tag.svg"]');
    await expect(img).toBeVisible();

    await expect
      .poll(() => pictogramResponses.length, { message: 'Piktogramm wurde nie angefragt' })
      .toBeGreaterThan(0);

    const svg = pictogramResponses.find((r) => r.url.endsWith('/static/pictograms/hard-tag.svg'));
    expect(
      svg,
      `hard-tag.svg nicht angefragt; gesehen: ${JSON.stringify(pictogramResponses)}`,
    ).toBeDefined();
    expect(svg!.status, 'hard-tag.svg muss mit 200 antworten').toBe(200);
    expect(svg!.contentType, 'hard-tag.svg muss als SVG ausgeliefert werden').toContain(
      'image/svg+xml',
    );

    // Und der Browser hat es auch wirklich dekodiert — ein 200 mit kaputtem Inhalt
    // würde hier auffallen.
    const naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
    expect(naturalWidth, 'Das SVG muss dekodiert worden sein').toBeGreaterThan(0);
  });

  test('Forderung 8 (Online-Markierung): farbiger Chip je Größe auf Positionsebene (Eva)', async ({
    page,
  }) => {
    await openFirstBeleg(page);
    const online = COLUMN_LABELS.indexOf('Online');

    // 38 ist die bevorzugte Größe (grün), jede andere gelieferte Größe wird rot.
    // Kurze Chip-Texte seit 0fe8df0, damit die Markierung nie abgeschnitten wird.
    await expect(sizeRows(page).nth(1).locator('td').nth(online)).toHaveText('Online-Highlight');
    await expect(sizeRows(page).nth(0).locator('td').nth(online)).toHaveText('Online');
    await expect(sizeRows(page).nth(2).locator('td').nth(online)).toHaveText('Online');

    // Pos 2 ist nicht online-relevant: die Zelle bleibt leer, die Spalte steht trotzdem.
    await expect(sizeRows(page).nth(3).locator('td').nth(online)).toBeEmpty();
  });

  test('D2: der Mengen-Stepper erfasst Mehr- und Mindermenge in der Nachbarspalte', async ({
    page,
  }) => {
    await openFirstBeleg(page);
    const row = sizeRows(page).first();

    await expect(row.locator('td').nth(COLUMN_LABELS.indexOf('Ist'))).toContainText('3');
    await row.getByRole('button', { name: 'Größe 36: Menge erhöhen' }).click();
    await expect(row.locator('td').nth(COLUMN_LABELS.indexOf('Ist'))).toContainText('4');
    await expect(row.locator('td').nth(COLUMN_LABELS.indexOf('Mehr-/Mindermenge'))).toHaveText(
      '+1 Mehrmenge',
    );

    await row.getByRole('button', { name: 'Größe 36: Menge verringern' }).click();
    await row.getByRole('button', { name: 'Größe 36: Menge verringern' }).click();
    await expect(row.locator('td').nth(COLUMN_LABELS.indexOf('Mehr-/Mindermenge'))).toHaveText(
      '−1 Mindermenge',
    );
  });
});

/* ------------------------------------------------------------------------- *
 * Forderung 9 — keine englischen Texte, keine rohen Enum-Schlüssel
 * ------------------------------------------------------------------------- */
test.describe('Forderung 9 — deutsche Oberfläche', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  /** Englische Wortmarken, die in einer deutschen Oberfläche nichts verloren haben. */
  const ENGLISH_WORDMARKS = /\b(retry|save|cancel|loading|error|submit)\b/i;
  /** Rohe Enum-Schlüssel wie `issue_open` oder `quantity_only`. */
  const RAW_ENUM_KEY = /^[a-z]+_[a-z]+$/;

  async function assertGermanOnly(page: Page, where: string): Promise<void> {
    const text = await page.locator('body').innerText();

    // Ohne diese Schranke wäre der ganze Test wertlos: ein leerer Screen enthält
    // per Definition kein englisches Wort und würde stillschweigend grün.
    expect(text.length, `${where}: der Screen muss überhaupt Text tragen`).toBeGreaterThan(50);

    const english = text.match(ENGLISH_WORDMARKS);
    expect(
      english,
      `${where}: englische Wortmarke „${english?.[0]}" im sichtbaren Text`,
    ).toBeNull();

    const rawKeys = [...new Set(text.split(/\s+/).filter((token) => RAW_ENUM_KEY.test(token)))];
    expect(rawKeys, `${where}: rohe Enum-Schlüssel im sichtbaren Text`).toEqual([]);
  }

  test('Forderung 9 (deutsche Texte): kein englisches Wort und kein roher Enum-Schlüssel im UI', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Anmeldung' })).toBeVisible();
    await assertGermanOnly(page, 'Anmelde-Screen');

    // Auch der Fehlerpfad — dort lauern „Error"/„Retry" am ehesten.
    await page.getByLabel('Mitarbeiternummer').fill(UNKNOWN_EMPLOYEE_NO);
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await expect(page.getByText('Mitarbeiternummer ist unbekannt.')).toBeVisible();
    await assertGermanOnly(page, 'Anmeldung mit unbekannter Nummer');

    await loginAndWaitForHome(page, MA_101.employeeNo);
    await assertGermanOnly(page, 'Bündel-Home');

    await stopRows(page).first().click();
    await openBeleg(page, belegNos(MA_101)[0]);
    await assertGermanOnly(page, 'Beleg-Detail');
  });
});
