// B9 Prio-Leiter: genau ein (bzw. je Variante ein) Beleg pro Rang der §8.1-Leiter,
// mit dokumentierter, exakt prüfbarer Reihenfolge. Alle Belege sonst identisch
// (30 Teile, Regal, Shopbereich 42 — bewusst außerhalb des Verladeplan-Kalenders,
// damit die gesetzten Verladetage nicht vom Kalender überschrieben werden).
import { seedMasterData, forceRuleConfig } from '../lib.js';
import { seedCaseDetails } from '../case-builders.js';
import type { ScenarioDefinition } from '../types.js';
import { seedCustomCases, type CustomCaseSpec } from './custom-case.js';

const BASE = { storageCode: 'R7', totalQuantity: 30, section: null, shopAreaNo: '42' } as const;

const B9_CASES: CustomCaseSpec[] = [
  // Rang 0 — Ausschluss: geparkter Beleg, nie verteilbar.
  { ...BASE, weBelegNo: '9.405.901', status: 'parked' },
  // Rang 1 — Manuelle Teamlead-Priorität.
  { ...BASE, weBelegNo: '9.405.905', priorityFlags: ['manual_teamlead_priority'] },
  // Rang 2 — Prio-Kennzeichen.
  { ...BASE, weBelegNo: '9.405.909', priorityFlags: ['prio'] },
  // Rang 3 — TIER 1 tägliche Verladung: EB-Abschnitt 7, Shopbereich 120, Shopbereich 90.
  { ...BASE, weBelegNo: '9.405.913', section: 7 },
  { ...BASE, weBelegNo: '9.405.917', shopAreaNo: '120' },
  { ...BASE, weBelegNo: '9.405.921', shopAreaNo: '90' },
  // Rang 4 — TIER 2: NOS-Ware und Hängeware (Bereich Hängebahn).
  { ...BASE, weBelegNo: '9.405.925', goodsTypeText: 'NOS' },
  { ...BASE, weBelegNo: '9.405.929', storageCode: 'HB-5/234' },
  // Rang 5 — TIER 3 Verladeplan: Abschnitte 1/2/3, fällig ab Verladetag (Abschnitt 2
  // ist mit Verladetag GESTERN bereits überfällig).
  { ...BASE, weBelegNo: '9.405.933', section: 1, loadPlanOffsetDays: 0 },
  { ...BASE, weBelegNo: '9.405.937', section: 2, loadPlanOffsetDays: -1 },
  { ...BASE, weBelegNo: '9.405.941', section: 3, loadPlanOffsetDays: 0 },
  // Rang 6 — FIFO: unpriorisierter Beleg (2 Tage alt).
  { ...BASE, weBelegNo: '9.405.945', bookingOffsetDays: 2 },
];

export const prioLeiterScenario: ScenarioDefinition = {
  key: 'prio-leiter',
  name: 'Prio-Leiter (alle Ränge)',
  description:
    'Je Rang der Prioritätsleiter genau ein Beleg (Rang 3 und 5 in allen Varianten): ' +
    'Ausschluss (geparkt) → manuelle TL-Priorität → Prio-Kennzeichen → tägliche ' +
    'Verladung (EB-Abschnitt 7, Shopbereich 120, Shopbereich 90) → NOS + Hängeware → ' +
    'Verladeplan-fällig (Abschnitte 1/2/3, Abschnitt 2 überfällig) → FIFO. Alle Belege ' +
    'sonst identisch (30 Teile), damit NUR die Leiter die Reihenfolge bestimmt.',
  expectedOutcome:
    'Exakte Verteil-Reihenfolge (Vorschau/Automatik, Priorität → FIFO): 9.405.905 ' +
    '(manuell) · 9.405.909 (Prio) · 9.405.913 (EB-Abschnitt 7) · 9.405.917 (Shop 120) · ' +
    '9.405.921 (Shop 90) · 9.405.925 (NOS) · 9.405.929 (Hängeware) · 9.405.933 ' +
    '(Verladeplan Abschn. 1, heute fällig) · 9.405.937 (Abschn. 2, überfällig) · ' +
    '9.405.941 (Abschn. 3, heute fällig) · 9.405.945 (FIFO). 9.405.901 (geparkt, ' +
    'Rang 0) liegt in der Ablage „Geparkt" und wird NIE verteilt.',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { locationIds } = await seedMasterData(ctx);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, B9_CASES);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};
