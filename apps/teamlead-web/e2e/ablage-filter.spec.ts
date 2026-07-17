import { test, expect, type Page } from './fixtures/test.js';

/**
 * Digitale Ablagen — die Filter-Gruppe „Bereich" ist aus dem „Weitere Filter"-
 * Popover entfernt (Kunden-Feedback 2026-07-15, docs/concept/ablage-filter §5c):
 * weder das Label noch die Chips Hängebahn/Palette/Regal existieren noch, und
 * ein aus einer alten Sitzung persistierter Bereich-Filter hat keine Wirkung
 * mehr. Die übrigen Gruppen (Warenart, Lieferungs-Gruppe, Teile-Anzahl) filtern
 * unverändert; Bereich bleibt als „Gruppieren nach"-Dimension erhalten.
 */

async function openAdvancedFilters(page: Page): Promise<ReturnType<Page['locator']>> {
  await page.goto('/ablagen');
  await expect(page.getByRole('heading', { name: 'Digitale Ablagen' })).toBeVisible();
  await page.getByRole('button', { name: 'Weitere Filter' }).click();
  const popover = page.locator('.MuiPopover-paper');
  await expect(popover).toBeVisible();
  return popover;
}

test('„Weitere Filter" führt keine Bereich-Gruppe mehr — die übrigen Gruppen bleiben und filtern', async ({
  page,
}) => {
  const popover = await openAdvancedFilters(page);

  // Die übrigen Filtergruppen sind unverändert vorhanden.
  await expect(popover.getByText('Warenart', { exact: true })).toBeVisible();
  await expect(popover.getByText('Lieferungs-Gruppe', { exact: true })).toBeVisible();
  await expect(popover.getByText('Teile-Anzahl', { exact: true })).toBeVisible();

  // Die Bereich-Gruppe ist restlos weg: weder Label noch Optionen.
  await expect(popover.getByText('Bereich', { exact: true })).toHaveCount(0);
  await expect(popover.getByRole('button', { name: 'Hängebahn', exact: true })).toHaveCount(0);
  await expect(popover.getByRole('button', { name: 'Palette', exact: true })).toHaveCount(0);
  await expect(popover.getByRole('button', { name: 'Regal', exact: true })).toHaveCount(0);

  // Die verbleibende Warenart-Gruppe filtert weiter: Chip aktivieren …
  await popover.getByRole('button', { name: 'NOS', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();

  // … Aktive-Filter-Zeile und Badge spiegeln genau diesen einen Filter …
  await expect(page.getByText('Aktive Filter:')).toBeVisible();
  await expect(page.getByText('Warenart: NOS')).toBeVisible();
  await expect(page.locator('.MuiBadge-badge')).toHaveText('1');

  // … und „Alle zurücksetzen" räumt ihn wieder ab.
  await page.getByRole('button', { name: 'Alle zurücksetzen' }).click();
  await expect(page.getByText('Aktive Filter:')).toHaveCount(0);

  // Scope-Guard: nur der Filter fiel weg — „Gruppieren nach" bietet Bereich weiterhin an.
  await page.getByRole('combobox').click();
  await expect(page.getByRole('option', { name: 'Bereich', exact: true })).toBeVisible();
});

test('ein persistierter Bereich-Filter aus einer alten Sitzung wird ignoriert und beim nächsten Speichern verworfen', async ({
  page,
}) => {
  // Stale `paket.view.ablagen`-Blob aus der Zeit VOR der Entfernung: enthält
  // die alte Filter-Dimension `bereiche` — sie darf nichts mehr ausblenden.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'paket.view.ablagen',
      JSON.stringify({
        laneOrder: [],
        collapsed: [],
        filter: {
          search: '',
          onlyNeedsDecision: false,
          onlyPrio: false,
          bereiche: ['Regal'],
          goodsTypes: [],
          deliveryGroup: 'any',
          minQuantity: null,
          maxQuantity: null,
          groupBy: 'none',
        },
      }),
    );
  });
  await page.goto('/ablagen');
  await expect(page.getByRole('heading', { name: 'Digitale Ablagen' })).toBeVisible();

  // Der stale Bereich-Filter hat keine Wirkung: kein Filter ist aktiv.
  await expect(page.getByText('Aktive Filter:')).toHaveCount(0);

  // Die nächste Filter-Interaktion speichert den Zustand neu — ohne `bereiche`.
  await page.getByRole('button', { name: 'Braucht Entscheidung', exact: true }).click();
  await expect(page.getByText('Aktive Filter:')).toBeVisible();
  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem('paket.view.ablagen');
    if (raw === null) return false;
    const { filter } = JSON.parse(raw) as { filter?: Record<string, unknown> };
    return filter?.onlyNeedsDecision === true && !('bereiche' in (filter ?? {}));
  });
});
