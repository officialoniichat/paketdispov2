// Pool-shape scenarios: B2 Peak-Tag, B3 Gemischtes Bündel, B8 Shop 31 NOS,
// B12 Skill-Tiers & Crew. All deterministic case specs relative to ctx.baseDate.
import { seedMasterData, forceRuleConfig } from '../lib.js';
import { seedCaseDetails } from '../case-builders.js';
import { standardScenario } from '../standard.js';
import type { ScenarioDefinition } from '../types.js';
import { seedCustomCases, seedCustomDetail, type CustomCaseSpec } from './custom-case.js';

// --- B2 Peak-Tag -----------------------------------------------------------------

/** B2: der Standard-Tag mit dem Spitzen-Volumenprofil (315 Belege, echter Max-Tag). */
export const peakTagScenario: ScenarioDefinition = {
  key: 'peak-tag',
  name: 'Peak-Tag (315 Belege)',
  description:
    'Wie „Standard-Tag", aber mit dem Spitzen-Volumenprofil des Kunden: 315 generierte ' +
    'Belege (der stärkste beobachtete Tag, Feb/Aug-Peaks) statt der typischen 171 — ' +
    'inklusive längerer Lieferungs-Runs (23–40 Belege). Lasttest für Board, Belege-Liste ' +
    'und Engine (< 5 s Budget).',
  expectedOutcome:
    'Pool ≈ 333 ready-Belege (315 generiert + 16 Mock-ProHandel + 2 Pool-Hold); nach ' +
    '„Automatik ausführen" ein voller Plan in < 5 s. Belege-Liste und Ablagen-Board ' +
    'zeigen das bekannte Skalierungslimit (200er-Kappung) — genau dafür ist dieses ' +
    'Szenario der Prüfstein.',
  seed(ctx) {
    return standardScenario.seed({ ...ctx, volume: 'peak' });
  },
};

// --- B3 Gemischtes Bündel ----------------------------------------------------------

const B3_REGAL_CODES = ['R3', 'R7', 'R11', 'R19'] as const;
const B3_HB_CODES = ['HB-5/234', 'HB-6/118', 'HB-7/090'] as const;
const B3_PALETTE_CODES = ['PA-1', 'PB-4', 'PC-2'] as const;

/**
 * Ein Block gleich großer Belege eines Bereichs. Belegnummern in 3er-Schritten
 * (Lücke ≥ 2), damit die Lieferungs-Erkennung (T3-Run, maxGap 1) NICHT anspringt.
 */
function bereichBlock(
  startNo: number,
  count: number,
  storageCodes: readonly string[],
  teile: number,
): CustomCaseSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(startNo + i * 3).padStart(7, '0');
    return {
      weBelegNo: `${n.slice(0, 1)}.${n.slice(1, 4)}.${n.slice(4)}`,
      storageCode: storageCodes[i % storageCodes.length]!,
      totalQuantity: teile,
      section: null,
    } satisfies CustomCaseSpec;
  });
}

/** B3: ausgewogener 3-Bereiche-Pool → jedes Pack Bereich-rein, das Team gemischt. */
export const gemischtesBuendelScenario: ScenarioDefinition = {
  key: 'gemischtes-buendel',
  name: 'Gemischtes Bündel (3 Bereiche)',
  description:
    'Ausgewogener Pool über alle drei Bereiche: 16× Regal, 12× Hängebahn, 12× Palette ' +
    'à ~52 Teile — bei Starter-Pack-Größe 200–250 Teile ergeben sich ~10 Packs, eines je ' +
    'Mitarbeiter. Die Engine hält jedes Pack bewusst Bereich-REIN (Routing zum passenden ' +
    'Spezialisten); die Mischung „wenn möglich" entsteht über das Team und den Tag ' +
    '(Folge-Packs per Self-Pull können einen anderen Bereich haben).',
  expectedOutcome:
    'Nach „Automatik ausführen" hat jeder der 10 auto-planbaren Mitarbeiter genau EIN ' +
    'Bereich-reines Starter-Pack (~200 Teile, 4 Belege); über das Board verteilt sind ' +
    'alle drei Bereiche sichtbar — je Zeile Bereich-Chip (Regal/Hängebahn/Palette) und ' +
    'Teile-Anzeige. Hängebahn-Packs zuerst (NOS+Hängeware-Tier) und bevorzugt bei den ' +
    'Hängebahn-Spezialisten (Anna Berger, Frank Lorenz, Jonas Weber).',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { locationIds } = await seedMasterData(ctx);
    const specs = [
      ...bereichBlock(9_301_001, 16, B3_REGAL_CODES, 52),
      ...bereichBlock(9_302_001, 12, B3_HB_CODES, 52),
      ...bereichBlock(9_303_001, 12, B3_PALETTE_CODES, 52),
    ];
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, specs);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};

// --- B8 Shop 31 NOS -----------------------------------------------------------------

/** B8: viele kleine NOS-Einzelanlieferungen für Shop 31 — keine Beleg-Obergrenze je Pack. */
export const shop31NosScenario: ScenarioDefinition = {
  key: 'shop-31-nos',
  name: 'Shop 31 — NOS-Einzelanlieferungen',
  description:
    '22 kleine NOS-Einzelanlieferungen (~10 Teile) für Shopbereich 31, jede mit eigenem ' +
    'Lieferschein und nicht-fortlaufender Belegnummer (keine Liefergruppen), plus 6 ' +
    'gewöhnliche Vororder-Belege als Kontrast. Zeigt: Packs sind TEILE-dimensioniert ' +
    '(200–250) ohne Beleg-Obergrenze, und NOS ist ein echter Prioritätstreiber (Tier 2 ' +
    'vor FIFO).',
  expectedOutcome:
    'Nach „Automatik ausführen" enthält das erste Pack ≥ 18 NOS-Belege (keine ' +
    'Maximal-Beleg-Kappung — die Teile-Summe entscheidet). Alle NOS-Belege liegen in ' +
    'der Verteil-Reihenfolge VOR den 6 Vororder-Kontrastbelegen (NOS-Tier 2 vor FIFO).',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { locationIds } = await seedMasterData(ctx);
    const nos: CustomCaseSpec[] = Array.from({ length: 22 }, (_, i) => {
      const n = String(9_311_001 + i * 3).padStart(7, '0');
      return {
        weBelegNo: `${n.slice(0, 1)}.${n.slice(1, 4)}.${n.slice(4)}`,
        storageCode: ['R3', 'R7', 'R11'][i % 3]!,
        totalQuantity: 10,
        goodsTypeText: 'NOS',
        shopAreaNo: '31',
        section: null,
      };
    });
    const kontrast = bereichBlock(9_312_001, 6, ['R19', 'R23'], 45);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, [...nos, ...kontrast]);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};

// --- B12 Skill-Tiers & Crew -----------------------------------------------------------

/** B12: alle fünf Skill-Stufen + temporäre Kräfte + ein Koffer-Beleg (WGR 812770). */
export const skillTiersCrewScenario: ScenarioDefinition = {
  key: 'skill-tiers-crew',
  name: 'Skill-Tiers & Crew',
  description:
    'Die volle Crew über alle fünf Skill-Stufen (profi/fortgeschritten/basis + ' +
    'starter „Azubi Mara" und dummy „Aushilfe Tom", beide measured=false → aus der ' +
    'Leistungsmessung ausgenommen) mit einem kompakten 13-Beleg-Pool. Ein Beleg trägt ' +
    'die Warengruppe 812770 „Koffer/Reisegepäck" — Koffer ist eine WGR, KEIN Bereich; ' +
    'sein Bereich bleibt durch den Lagerplatz (Regal) fixiert.',
  expectedOutcome:
    'Nach „Automatik ausführen" erhalten NUR profi/fortgeschritten/basis Packs; ' +
    '„Azubi Mara" (starter) und „Aushilfe Tom" (dummy) bleiben als freie Zeilen auf ' +
    'dem Board (nur manuelle Zuweisung möglich; Self-Pull antwortet „skill_tier"). ' +
    'Beleg 9.321.037 zeigt im Belegdetail die Position mit WGR 812770 ' +
    '„Koffer/Reisegepäck". KPI: Durchsatz zählt alle, Leistung nur measured-Kräfte.',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { locationIds } = await seedMasterData(ctx);
    const pool = bereichBlock(9_321_001, 12, ['R3', 'HB-5/234', 'PA-1', 'R11'], 55);
    const koffer: CustomCaseSpec = {
      weBelegNo: '9.321.037',
      storageCode: 'R7',
      totalQuantity: 24,
      section: null,
      goodsTypeText: 'Nachorder',
    };
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, [...pool, koffer]);
    await seedCaseDetails(ctx.prisma, new Map());
    // Nach seedCaseDetails, damit die Koffer-Position (WGR 812770) nicht von den
    // generischen Detail-Defaults überschrieben wird.
    await seedCustomDetail(ctx.prisma, '9.321.037', [{ wgr: '812770', sizes: ['one size'] }]);
  },
};
