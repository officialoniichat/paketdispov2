// B14 Problemfälle & Ablage (alle Lanes gefüllt + Problem-Deep-Link) und
// B15 Leerer Tag (nur Stammdaten — die UI-Leerzustände).
import { seedMasterData, forceRuleConfig } from '../lib.js';
import { seedCaseDetails, seedLifecycleCases, type SeedLifecycleCase } from '../case-builders.js';
import type { ScenarioDefinition } from '../types.js';
import { seedCustomCases, type CustomCaseSpec } from './custom-case.js';

// --- B14 Problemfälle & Ablage ---------------------------------------------------------

/** Jede Ablage-Lane mindestens einmal, Probleme doppelt (verschiedene Problem-Typen). */
const B14_LIFECYCLE: SeedLifecycleCase[] = [
  // Problemfälle-Lane: zwei offene Probleme mit unterschiedlichem Typ.
  {
    weBelegNo: '9.409.101', storageCode: 'D-3', section: 2, goodsTypeText: 'Prio',
    totalQuantity: 33, effortPoints: 8, estimatedMinutes: 20, status: 'issue_open',
    employeeNo: 'ma-103',
    issue: { reasonId: 'pr_wrong_color', description: 'Farbe weicht von der Arbeitsanweisung ab' },
  },
  {
    weBelegNo: '9.409.105', storageCode: 'R7', section: 3, goodsTypeText: 'Nachorder',
    totalQuantity: 48, effortPoints: 11, estimatedMinutes: 24, status: 'issue_open',
    employeeNo: 'ma-101',
    issue: { kind: 'under_delivery', deviationQty: -8, description: 'Nur 40 von 48 Teilen im Karton' },
  },
  // Geparkt-Lane (×2, eine mit Bucherinnen-Notiz).
  {
    weBelegNo: '9.409.109', storageCode: 'R19', section: 4, goodsTypeText: 'Nachorder',
    totalQuantity: 52, effortPoints: 12, estimatedMinutes: 26, status: 'parked',
    employeeNo: 'ma-102',
    attentionNote: 'Bucherin: Lieferant hat Nachlieferung angekündigt.',
  },
  {
    weBelegNo: '9.409.113', storageCode: 'PB-4', section: 2, goodsTypeText: 'Vororder',
    totalQuantity: 26, effortPoints: 6, estimatedMinutes: 14, status: 'parked',
    employeeNo: 'ma-105',
  },
  // Weitergeleitet-Lane: BEIDE Empfänger (Retouren + Lieferscheinbucher).
  {
    weBelegNo: '9.409.117', storageCode: 'PB-4', section: 3, goodsTypeText: 'Nachorder',
    totalQuantity: 22, effortPoints: 6, estimatedMinutes: 14, status: 'parked',
    employeeNo: 'ma-102', forwardedTo: 'retourenabteilung',
  },
  {
    weBelegNo: '9.409.121', storageCode: 'R11', section: 2, goodsTypeText: 'Vororder',
    totalQuantity: 30, effortPoints: 7, estimatedMinutes: 16, status: 'parked',
    employeeNo: 'ma-104', forwardedTo: 'lieferscheinbucher',
  },
  // Geklärter Problemfall (problem_resolved mit ZST-Teilmenge): grün beim MA,
  // wartet auf dessen Weiterbearbeitung.
  {
    weBelegNo: '9.409.125', storageCode: 'R19', section: 3, goodsTypeText: 'Nachorder',
    totalQuantity: 100, effortPoints: 20, estimatedMinutes: 40, status: 'problem_resolved',
    employeeNo: 'ma-102', completedQuantity: 40, completedAt: '13:45',
  },
  // Prüfen/TL-Topf (needs_review mit Aufmerksamkeits-Notiz), in Arbeit, Abgeschlossen,
  // ZST + Archiv (DocuWare-Link), storniert.
  {
    weBelegNo: '9.409.129', storageCode: 'R27', section: 7, goodsTypeText: 'NOS',
    totalQuantity: 28, effortPoints: 7, estimatedMinutes: 16, status: 'needs_review',
    employeeNo: 'ma-101',
    attentionNote: 'Bucherin: Preisangaben unklar — bitte vor Freigabe prüfen.',
  },
  {
    weBelegNo: '9.409.133', storageCode: 'R27', section: 1, goodsTypeText: 'Vororder',
    totalQuantity: 41, effortPoints: 10, estimatedMinutes: 22, status: 'in_progress',
    employeeNo: 'ma-103',
  },
  {
    weBelegNo: '9.409.137', storageCode: 'R7', section: 2, goodsTypeText: 'Vororder',
    totalQuantity: 60, effortPoints: 14, estimatedMinutes: 28, status: 'completed',
    employeeNo: 'ma-101', completedQuantity: 60, completedAt: '12:32',
  },
  {
    weBelegNo: '9.409.141', storageCode: 'R27', section: 7, goodsTypeText: 'NOS',
    totalQuantity: 45, effortPoints: 11, estimatedMinutes: 22, status: 'zst_done',
    employeeNo: 'ma-101', completedQuantity: 45, completedAt: '11:40', exportedAt: '17:00',
  },
  {
    weBelegNo: '9.409.145', storageCode: 'PB-4', section: 4, goodsTypeText: 'Sonderposten',
    totalQuantity: 18, effortPoints: 5, estimatedMinutes: 12, status: 'cancelled',
    employeeNo: 'ma-103',
  },
];

/** Kleiner ready-Pool daneben, inkl. eines TL-Topf-Belegs mit Aufmerksamkeits-Flag. */
const B14_READY: CustomCaseSpec[] = [
  { weBelegNo: '9.409.201', storageCode: 'R3', totalQuantity: 40, section: null, attentionNote: 'Bucherin: Ware bitte gesondert prüfen (Reklamation beim letzten Mal).' },
  { weBelegNo: '9.409.205', storageCode: 'R23', totalQuantity: 44, section: null },
  { weBelegNo: '9.409.209', storageCode: 'HB-6/118', totalQuantity: 38, section: null },
  { weBelegNo: '9.409.213', storageCode: 'PA-2', totalQuantity: 42, section: null },
];

export const problemfaelleAblageScenario: ScenarioDefinition = {
  key: 'problemfaelle-ablage',
  name: 'Problemfälle & Ablage',
  description:
    'Alle digitalen Ablage-Lanes gleichzeitig gefüllt: 2 offene Probleme ' +
    '(Falsche Farbe / Fehlmenge), 2 geparkte Belege, Weiterleitungen an BEIDE ' +
    'Empfänger (Retourenabteilung + Lieferscheinbucher), ein ZST-Teilabschluss ' +
    '(40 von 100 Teilen), TL-Topf (needs_review + Aufmerksamkeits-Flag), in Arbeit, ' +
    'Abgeschlossen, Archiv (zst_done mit DocuWare-Link) und storniert — plus ein ' +
    'kleiner ready-Pool.',
  expectedOutcome:
    'Ablagen-Board: JEDE Lane zeigt mindestens einen Beleg (Probleme ×2, Geparkt ×2, ' +
    'Weitergeleitet ×2 nach Empfänger gruppiert, Teilabschluss 9.409.125 „40 von 100", ' +
    'TL-Topf mit Notizen, Abgeschlossen/Archiv mit DocuWare-Link auf 9.409.141). ' +
    'Deep-Link testen: Problem-Eintrag auf 9.409.101 anklicken → Belegdetail öffnet ' +
    'mit dem offenen Problem „Farbe weicht ab".',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { userIds, locationIds } = await seedMasterData(ctx);
    await seedLifecycleCases(ctx.prisma, ctx.baseDate, locationIds, userIds, B14_LIFECYCLE);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, B14_READY);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};

// --- B15 Leerer Tag ---------------------------------------------------------------------

export const leererTagScenario: ScenarioDefinition = {
  key: 'leerer-tag',
  name: 'Leerer Tag',
  description:
    'Nur Stammdaten: Team, Schichten, Tische, Lagerplätze, Kataloge und Regelwerk — ' +
    'aber KEIN einziger Beleg. Zeigt sämtliche Leerzustände der Oberflächen.',
  expectedOutcome:
    'Dashboard mit 0-Kennzahlen, leeres Mitarbeiterboard (alle Zeilen „frei"), leere ' +
    'Belege-Liste, leere Ablage-Lanes; „Automatik ausführen" meldet 0 Bündel / 0 ' +
    'Belege; Self-Pull in der Mitarbeiter-App antwortet „pool_empty". Keine Fehler, ' +
    'nirgends.',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    await seedMasterData(ctx);
  },
};
