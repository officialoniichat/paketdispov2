// Lieferungs-Szenarien: B4 zusammenhängende Lieferungen (alle drei Signale + die
// harte Brax-Lücke) und B5 unvollständige Lieferung (Pool-Hold + TL-Freigabe).
import { seedMasterData, forceRuleConfig } from '../lib.js';
import { seedCaseDetails } from '../case-builders.js';
import type { ScenarioDefinition } from '../types.js';
import { seedCustomCases, type CustomCaseSpec } from './custom-case.js';

// --- B4 Lieferung zusammenhängend ---------------------------------------------------

const B4_CASES: CustomCaseSpec[] = [
  // (a) T3-Run: fortlaufende Belegnummern, gleicher Tag + Abschnitt, aber je eigener
  // Lieferschein → Signal „run" (vermutet). Default-Regelwerk verteilt Vermutete NICHT
  // automatisch (autoDistributeSuspected=false) — sie warten auf die TL-Bestätigung.
  { weBelegNo: '9.401.101', storageCode: 'R7', totalQuantity: 30, section: 2, deliveryNoteNo: 'LS-A-8801' },
  { weBelegNo: '9.401.102', storageCode: 'R7', totalQuantity: 26, section: 2, deliveryNoteNo: 'LS-A-8802' },
  { weBelegNo: '9.401.103', storageCode: 'R7', totalQuantity: 34, section: 2, deliveryNoteNo: 'LS-A-8803' },
  // (b) T2-Note: identischer Lieferschein, Belegnummern weit auseinander → „likely",
  // wird automatisch verteilt und bleibt dank Pack-Kohäsion auf EINER Person.
  { weBelegNo: '9.401.201', storageCode: 'R11', totalQuantity: 28, section: 3, deliveryNoteNo: 'LS-77001' },
  { weBelegNo: '9.401.215', storageCode: 'R11', totalQuantity: 22, section: 3, deliveryNoteNo: 'LS-77001' },
  { weBelegNo: '9.401.230', storageCode: 'R11', totalQuantity: 31, section: 3, deliveryNoteNo: 'LS-77001' },
  // (c) HARTER Brax-Fall: NICHT-fortlaufende Lieferscheinnummern, nicht-fortlaufende
  // Belegnummern — aber durchlaufende Kartonnummerierung (KTN 4711/1..3, im externalRef
  // dokumentiert). Kartonnummern-Kontinuität ist derzeit KEIN Gruppierungssignal →
  // bewusst demonstrierte Lücke: keine Gruppe.
  { weBelegNo: '9.401.310', storageCode: 'R19', totalQuantity: 25, section: 2, deliveryNoteNo: 'LS-B-4711', externalRefSuffix: 'brax-karton-4711/1-von-3' },
  { weBelegNo: '9.401.317', storageCode: 'R19', totalQuantity: 27, section: 2, deliveryNoteNo: 'LS-B-4738', externalRefSuffix: 'brax-karton-4711/2-von-3' },
  { weBelegNo: '9.401.325', storageCode: 'R19', totalQuantity: 23, section: 2, deliveryNoteNo: 'LS-B-4770', externalRefSuffix: 'brax-karton-4711/3-von-3' },
  // Füll-Belege, damit die Automatik neben den Gruppen normalen Stoff hat.
  { weBelegNo: '9.401.401', storageCode: 'R3', totalQuantity: 40, section: null },
  { weBelegNo: '9.401.405', storageCode: 'R23', totalQuantity: 45, section: null },
  { weBelegNo: '9.401.409', storageCode: 'PA-1', totalQuantity: 38, section: null },
  { weBelegNo: '9.401.413', storageCode: 'HB-6/118', totalQuantity: 42, section: null },
];

export const lieferungZusammenhaengendScenario: ScenarioDefinition = {
  key: 'lieferung-zusammenhaengend',
  name: 'Lieferung zusammenhängend',
  description:
    'Drei mehrteilige Lieferungen, je eine pro Erkennungssignal: (a) fortlaufende ' +
    'Belegnummern 9.401.101–103 (T3-Run, „vermutet"), (b) identischer Lieferschein ' +
    'LS-77001 auf 9.401.201/.215/.230 (T2, „wahrscheinlich"), (c) der harte Brax-Fall ' +
    '9.401.310/.317/.325: NICHT-fortlaufende Lieferscheinnummern, aber durchlaufende ' +
    'Kartonnummerierung (KTN 4711/1–3) — Kartonnummern sind heute kein ' +
    'Gruppierungssignal.',
  expectedOutcome:
    'Lieferungen/Board: (a) „Lieferung ×3" (vermutet) auf 9.401.101–103, unter dem ' +
    'Default-Regelwerk NICHT automatisch verteilt (wartet auf TL-Bestätigung); ' +
    '(b) „Lieferung ×3" (wahrscheinlich) auf der LS-77001-Gruppe, nach „Automatik ' +
    'ausführen" geschlossen bei EINEM Mitarbeiter; (c) die Brax-Belege bekommen KEINE ' +
    'Gruppen-Badge, obwohl die Kartonnummern im Beleg-Hinweis (externalRef ' +
    '„brax-karton-4711/1..3") durchlaufen — die bekannte Erkennungslücke.',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { locationIds } = await seedMasterData(ctx);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, B4_CASES);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};

// --- B5 Lieferung unvollständig -------------------------------------------------------

const B5_CASES: CustomCaseSpec[] = [
  // Unvollständige bestätigte Lieferung: „Lieferschein 2 von 4" — zwei Mitglieder sind
  // gebucht, zwei fehlen. Pool-Hold (D2): die Engine hält BEIDE zurück, bis alle vier
  // da sind ODER der Teamlead „trotzdem bearbeiten" freigibt.
  { weBelegNo: '9.402.501', storageCode: 'R19', totalQuantity: 24, section: 2, deliveryNoteNo: 'LS-2026-000501', deliverySourceGroupKey: 'PH-LFG-501', deliverySourceGroupSize: 4 },
  { weBelegNo: '9.402.502', storageCode: 'R19', totalQuantity: 30, section: 2, deliveryNoteNo: 'LS-2026-000501', deliverySourceGroupKey: 'PH-LFG-501', deliverySourceGroupSize: 4 },
  // Vollständige Kontrast-Gruppe „3 von 3" — wird normal verteilt.
  { weBelegNo: '9.402.601', storageCode: 'R7', totalQuantity: 20, section: 3, deliveryNoteNo: 'LS-2026-000601', deliverySourceGroupKey: 'PH-LFG-601', deliverySourceGroupSize: 3 },
  { weBelegNo: '9.402.602', storageCode: 'R7', totalQuantity: 25, section: 3, deliveryNoteNo: 'LS-2026-000601', deliverySourceGroupKey: 'PH-LFG-601', deliverySourceGroupSize: 3 },
  { weBelegNo: '9.402.603', storageCode: 'R7', totalQuantity: 22, section: 3, deliveryNoteNo: 'LS-2026-000601', deliverySourceGroupKey: 'PH-LFG-601', deliverySourceGroupSize: 3 },
  // Füll-Belege.
  { weBelegNo: '9.402.701', storageCode: 'R3', totalQuantity: 44, section: null },
  { weBelegNo: '9.402.705', storageCode: 'PA-2', totalQuantity: 39, section: null },
  { weBelegNo: '9.402.709', storageCode: 'HB-7/090', totalQuantity: 41, section: null },
];

export const lieferungUnvollstaendigScenario: ScenarioDefinition = {
  key: 'lieferung-unvollstaendig',
  name: 'Lieferung unvollständig (Pool-Hold)',
  description:
    'Eine bestätigte Lieferung „Lieferschein X von 4", von der erst 2 Belege gebucht ' +
    'sind (9.402.501/.502) → Lieferungs-Pool-Hold: die Engine hält alle anwesenden ' +
    'Mitglieder zurück, bis die Lieferung vollständig ist oder der Teamlead sie mit ' +
    '„Trotzdem bearbeiten" freigibt (die Freigabe wirkt durchgängig bis in die ' +
    'Engine). Dazu eine vollständige 3-von-3-Kontrastgruppe.',
  expectedOutcome:
    'Lieferungen-Ansicht: Gruppe „2 von 4 · 2 fehlen" auf 9.402.501/.502. „Automatik ' +
    'ausführen" lässt beide im Pool (Grund „Lieferung unvollständig"); die vollständige ' +
    '3-von-3-Gruppe wird normal und geschlossen verteilt. Nach TL-Freigabe „Trotzdem ' +
    'bearbeiten" verteilt die nächste Automatik auch die beiden Hold-Belege.',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { locationIds } = await seedMasterData(ctx);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, B5_CASES);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};
