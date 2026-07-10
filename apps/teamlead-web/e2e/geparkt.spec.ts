/**
 * Geparkt — Gegenprobe zum „Rest parken" der Mitarbeiter-App.
 *
 * Dustin: „Der Rest wird dann im Geparkt stehen."
 *
 * Die einzige Stelle, an der beide Apps denselben Vorgang sehen: der Mitarbeiter
 * parkt über `POST /api/me/park` (B4 Parkposition), der Teamlead soll die Belege
 * anschließend in den Digitalen Ablagen in der Spalte „Geparkt" sehen.
 *
 * ══ BEFUND: die Forderung ist NICHT erfüllt. Der Test ist absichtlich rot. ══
 *
 * `parkRemaining` setzt den Beleg auf `status: 'ready'` und hängt ihn vom Bündel
 * ab (`apps/backend-api/src/cases/cases.service.ts:222`) — er wandert also zurück
 * in den freien Pool und wird ins nächste Bündel eingeplant. Die Spalte „Geparkt"
 * des Cockpits nimmt aber ausschließlich Belege mit `status === 'parked'` auf
 * (`apps/teamlead-web/src/data/remoteDataset.ts:253`). Ein vom Mitarbeiter
 * geparkter Beleg landet deshalb je nach Prio-Kennzeichen in „Prio" oder
 * „Sonstige", nie in „Geparkt".
 *
 * Nur der Teamlead-Pfad (`POST /api/teamlead/cases/:id/park`) setzt `parked`.
 * Der Mitarbeiter-Pfad emittiert lediglich `case.parked_by_employee` im Audit.
 *
 * `test.fail()` hält die Forderung als ausführbare Spezifikation fest: sobald
 * jemand den Mitarbeiter-Park-Pfad auf `parked` umstellt, schlägt dieser Test
 * mit „passed unexpectedly" an und muss entmarkiert werden.
 */
import { test, expect } from './fixtures/test.js';
import { bearer, login, PLANNABLE_EMPLOYEE_NOS } from './fixtures/auth.js';
import { BACKEND_URL } from './fixtures/ports.js';

interface TodayCase {
  id: string;
  weBelegNo: string;
  status: string;
}

/**
 * Erster Mitarbeiter, dem das Recalculate im globalSetup ein Bündel mit noch
 * unbegonnenen (`assigned`) Belegen zugeteilt hat — nur die lassen sich parken
 * (`cases.service.ts:209`).
 */
async function findEmployeeWithUnstartedCases(): Promise<{ token: string; cases: TodayCase[] }> {
  for (const employeeNo of PLANNABLE_EMPLOYEE_NOS) {
    // Mitarbeiter melden sich ohne PIN an (Dustins Forderung).
    const token = await login(employeeNo);
    const res = await fetch(`${BACKEND_URL}/api/me/today`, { headers: bearer(token) });
    if (!res.ok) continue;

    const today = (await res.json()) as { cases: TodayCase[] };
    const unstarted = today.cases.filter((c) => c.status === 'assigned');
    if (unstarted.length > 0) return { token, cases: unstarted };
  }
  throw new Error(
    'Kein Mitarbeiter hat nach dem Recalculate ein Bündel mit unbegonnenen Belegen — ' +
      'die Vorbedingung für „Rest parken" fehlt.',
  );
}

/** Parkt die unbegonnenen Belege des Mitarbeiters („Rest parken"). */
async function parkRemaining(token: string, cases: TodayCase[]): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/me/park`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ caseIds: cases.map((c) => c.id) }),
  });
  const body = await res.text();
  expect(res.ok, `POST /api/me/park → HTTP ${res.status}: ${body}`).toBe(true);
  expect((JSON.parse(body) as { parkedCaseIds: string[] }).parkedCaseIds).toHaveLength(cases.length);
}

test('Geparkt (Dustin: „Der Rest wird dann im Geparkt stehen."): über „Rest parken" geparkte Belege stehen im Cockpit unter „Geparkt"', async ({
  page,
}) => {
  // Bekannter Befund, siehe Dateikopf: der Mitarbeiter-Park-Pfad setzt `ready`,
  // die Spalte „Geparkt" zeigt nur `parked`.
  test.fail();

  const { token, cases } = await findEmployeeWithUnstartedCases();
  await parkRemaining(token, cases);

  await page.goto('/ablagen');
  await expect(page.getByRole('heading', { name: 'Digitale Ablagen' })).toBeVisible();

  // Anker auf die Spalte: ihr Untertitel ist eindeutig, während der reine Titel
  // „Geparkt" auch als Status-Chip auf fremden Karten vorkommt.
  const geparktLane = page
    .getByText('Aus Automatik ausgeschlossen')
    .locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]');

  for (const parked of cases) {
    await expect(geparktLane.getByText(parked.weBelegNo, { exact: true })).toBeVisible();
  }
});
