// Daten- und Mengen-Sonderfälle: B6 Datenqualität (Intake-Gate „zurück an Bucher")
// und B7 Groß-Beleg „Knecki" (Monster-Schwelle + Folgetag-Fortsetzung).
import { requireId, seedMasterData, forceRuleConfig } from '../lib.js';
import { seedCaseDetails } from '../case-builders.js';
import type { ScenarioDefinition } from '../types.js';
import { seedCarryoverBundle, seedCustomCases, type CustomCaseSpec } from './custom-case.js';

// --- B6 Datenqualität -----------------------------------------------------------------

const B6_CASES: CustomCaseSpec[] = [
  // Intake-Gate (D1): Pflichtdaten fehlen → blocked, „zurück an Bucher", NIE im Pool.
  { weBelegNo: '9.403.701', storageCode: null, totalQuantity: 30, section: 2, status: 'blocked', missingFields: ['Lagerplatz'] },
  { weBelegNo: '9.403.705', storageCode: 'R7', totalQuantity: 26, section: 2, status: 'blocked', missingFields: ['Lieferschein'], deliveryNoteNo: null },
  { weBelegNo: '9.403.709', storageCode: null, totalQuantity: 18, section: 3, status: 'blocked', missingFields: ['Lagerplatz', 'Lieferschein'], deliveryNoteNo: null },
  // Der NACHGEPFLEGTE Fall: die Bucherin hat Lagerplatz + Lieferschein ergänzt —
  // der Beleg ist wieder `ready` und normal verteilbar.
  { weBelegNo: '9.403.713', storageCode: 'R11', totalQuantity: 28, section: 2, attentionNote: 'Bucherin: Daten nachgepflegt (Lagerplatz + Lieferschein ergänzt) — wieder freigegeben.' },
  // Normale Füll-Belege.
  { weBelegNo: '9.403.801', storageCode: 'R3', totalQuantity: 42, section: null },
  { weBelegNo: '9.403.805', storageCode: 'PA-1', totalQuantity: 38, section: null },
  { weBelegNo: '9.403.809', storageCode: 'HB-5/234', totalQuantity: 35, section: null },
];

export const datenqualitaetScenario: ScenarioDefinition = {
  key: 'datenqualitaet',
  name: 'Datenqualität (zurück an Bucher)',
  description:
    'Drei Belege mit fehlenden Pflichtdaten im Intake-Gate: 9.403.701 ohne Lagerplatz, ' +
    '9.403.705 ohne Lieferschein, 9.403.709 ohne beides → Status „blockiert", Aktion ' +
    '„zurück an Bucher", niemals im Verteil-Pool. Dazu 9.403.713 als bereits ' +
    'nachgepflegter Fall (Daten ergänzt → wieder ready) und drei normale Belege.',
  expectedOutcome:
    'Die drei blockierten Belege erscheinen in der „Zurück an Bucher"-Ablage mit ihren ' +
    'fehlenden Feldern und tauchen auch nach „Automatik ausführen" NIE im Plan auf. ' +
    '9.403.713 (nachgepflegt, mit Aufmerksamkeits-Notiz) ist wieder ready und wird ' +
    'normal verteilt. Live-Nachpflege testen: an einem blockierten Beleg „Intake ' +
    'vervollständigen" ausfüllen → er wechselt zu ready und die nächste Automatik ' +
    'plant ihn ein.',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { locationIds } = await seedMasterData(ctx);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, B6_CASES);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};

// --- B7 Groß-Beleg „Knecki" -------------------------------------------------------------

const B7_CASES: CustomCaseSpec[] = [
  // Monster-Beleg ÜBER der Teile-Schwelle (2000): wartet auf die manuelle TL-Entscheidung.
  { weBelegNo: '9.404.801', storageCode: 'PA-1', totalQuantity: 2400, section: 2, estimatedMinutes: 420 },
  // Gestern begonnener Monster-Beleg (Folgetag-Fortsetzung): teilabgeschlossen, hängt
  // noch am Vortages-Bündel von Dirk Hansen (ma-104).
  { weBelegNo: '9.404.802', storageCode: 'PA-2', totalQuantity: 2600, section: 2, status: 'partially_completed', bookingOffsetDays: 1, estimatedMinutes: 460 },
  // Normaler Tages-Pool.
  { weBelegNo: '9.404.901', storageCode: 'R3', totalQuantity: 48, section: null },
  { weBelegNo: '9.404.905', storageCode: 'R7', totalQuantity: 52, section: null },
  { weBelegNo: '9.404.909', storageCode: 'R11', totalQuantity: 45, section: null },
  { weBelegNo: '9.404.913', storageCode: 'R19', totalQuantity: 50, section: null },
  { weBelegNo: '9.404.917', storageCode: 'HB-5/234', totalQuantity: 44, section: null },
  { weBelegNo: '9.404.921', storageCode: 'HB-6/118', totalQuantity: 47, section: null },
  { weBelegNo: '9.404.925', storageCode: 'PB-4', totalQuantity: 49, section: null },
  { weBelegNo: '9.404.929', storageCode: 'PC-2', totalQuantity: 46, section: null },
];

export const grossBelegKneckiScenario: ScenarioDefinition = {
  key: 'gross-beleg-knecki',
  name: 'Groß-Beleg „Knecki"',
  description:
    'Ein 2.400-Teile-Beleg (9.404.801) über der Monster-Schwelle (2.000 Teile) wartet ' +
    'im Pool auf die manuelle Teamlead-Entscheidung. Zusätzlich hängt Dirk Hansen ' +
    '(ma-104) noch an einem GESTERN begonnenen 2.600-Teile-Beleg (9.404.802, ' +
    'teilabgeschlossen am Vortages-Bündel) — die Folgetag-Fortsetzung greift: keine ' +
    'neuen Belege für ihn, bis der Groß-Beleg fertig ist.',
  expectedOutcome:
    '„Automatik ausführen": 9.404.801 bleibt unverteilt im Pool (Grund „Groß-Beleg — ' +
    'manuelle TL-Entscheidung", zuweisbar über Mitarbeiterboard → Zuweisen); Dirk ' +
    'Hansen erhält KEIN neues Starter-Pack (seine Schicht ist der Verteilung entzogen, ' +
    'Fortsetzung an 9.404.802); sein Self-Pull antwortet „continuation". Alle anderen ' +
    'Mitarbeiter werden normal beplant.',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { userIds, locationIds } = await seedMasterData(ctx);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, B7_CASES);
    await seedCaseDetails(ctx.prisma, new Map());
    await seedCarryoverBundle(
      ctx.prisma,
      ctx.baseDate,
      requireId(userIds, 'ma-104', 'user'),
      ['9.404.802'],
    );
  },
};
