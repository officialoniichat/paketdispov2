// B13 Online-Größen: Positionen, die alle drei Regel-Fälle der Online-Größen-
// Präferenzen treffen. Die Präferenzen kommen ausschließlich aus der eingecheckten
// CSV-Fixture `../fixtures/online-size-preferences.csv` (identisches Format wie der
// Admin-Upload POST /api/admin/online-size-preferences/upload) — Seed und Upload-Demo
// haben dieselbe Quelle und können nicht auseinanderlaufen.
import { seedMasterData, forceRuleConfig } from '../lib.js';
import type { ScenarioDefinition } from '../types.js';
import { seedCustomCases, seedCustomDetail, type CustomCaseSpec } from './custom-case.js';

const B13_CASES: CustomCaseSpec[] = [
  // Fall 1 — Wunschgröße GELIEFERT: WGR 218110 bevorzugt 38 (Alternative 40);
  // geliefert werden 38 + 40 → 38 grün, 40 rot.
  { weBelegNo: '9.408.101', storageCode: 'R7', totalQuantity: 24, section: null, goodsTypeText: 'Nachorder' },
  // Fall 2 — Wunschgröße FEHLT, Alternative da: WGR 312400 bevorzugt 32/32
  // (Alternative 31/32); geliefert 31/32 + 30/32 → 31/32 grün, 30/32 rot.
  { weBelegNo: '9.408.105', storageCode: 'R11', totalQuantity: 20, section: null, goodsTypeText: 'Nachorder' },
  // Fall 3 — Wunsch UND Alternative fehlen: WGR 511100 bevorzugt 40 (keine
  // Alternative); geliefert 42 + 44 → irgendeine Größe (erste gelieferte, 42) grün.
  { weBelegNo: '9.408.109', storageCode: 'R19', totalQuantity: 18, section: null, goodsTypeText: 'Nachorder' },
];

export const onlineGroessenScenario: ScenarioDefinition = {
  key: 'online-groessen',
  name: 'Online-Größen (Rot/Grün)',
  description:
    'Drei online-relevante Belege gegen die Präferenz-Regeln aus der CSV-Fixture ' +
    '(wgr;sizeVariant;preferredSize;alternativeSize — dieselbe Datei ist im Admin per ' +
    'CSV-Upload einspielbar): 9.408.101 liefert die Wunschgröße (218110 → 38), ' +
    '9.408.105 nur die Alternative (312400 → 31/32 statt 32/32), 9.408.109 weder ' +
    'Wunsch noch Alternative (511100 → beliebige Größe).',
  expectedOutcome:
    'Im Belegdetail der Mitarbeiter-App (Positions-/Größen-Tabelle): 9.408.101 → ' +
    'Größe 38 GRÜN, 40 rot (Wunschgröße geliefert); 9.408.105 → 31/32 GRÜN ' +
    '(Alternative greift, Wunsch 32/32 fehlt), 30/32 rot; 9.408.109 → 42 GRÜN ' +
    '(weder Wunsch 40 noch Alternative lieferbar → beliebige Größe), 44 rot. ' +
    'Admin → Online-Größen listet exakt die Zeilen der Fixture.',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    // seedMasterData lädt die Präferenzen bereits aus der CSV-Fixture (Single Source).
    const { locationIds } = await seedMasterData(ctx);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, B13_CASES);
    // Explizite Positionen/Größen — bewusst OHNE das generische seedCaseDetails,
    // das die gezielten Größen-Sätze überschreiben würde.
    await seedCustomDetail(ctx.prisma, '9.408.101', [
      { wgr: '218110', sizes: ['38', '40'], onlineRelevant: true },
    ]);
    await seedCustomDetail(ctx.prisma, '9.408.105', [
      { wgr: '312400', sizes: ['31/32', '30/32'], onlineRelevant: true },
    ]);
    await seedCustomDetail(ctx.prisma, '9.408.109', [
      { wgr: '511100', sizes: ['42', '44'], onlineRelevant: true },
    ]);
  },
};
