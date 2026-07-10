// Deterministic seed-data generator (§14.1). Turns the customer's REAL historical
// volume profile into a realistic ready-pool for one day so the cockpit, the
// "Digitale Ablagen" board and the assignment engine can be exercised at true
// scale. Provenance of the volume numbers: docs/data/belege-history-per-day.csv
// (derived from the customer Excel: 363 days, 61 849 Belege; per-day min 2,
// median 171, p90 249, max 315). Two scenarios:
//   - 'typical' → 171 Belege  (the median working day)
//   - 'peak'    → 315 Belege  (the busiest observed day, Feb/Aug peaks)
//
// EVERYTHING here is a pure function of a fixed PRNG seed + the scenario, so a
// reseed is fully reproducible (no Date.now / Math.random). SEED_DATE only labels
// the calendar day; it never feeds the RNG, so the generated pool is identical
// regardless of when the seed runs.
import type {
  CheckMode,
  GoodsTypeText,
  LocationKind,
  PriorityFlag,
  SkillTier,
} from '@prisma/client';

// --- Scenario -------------------------------------------------------------

export type SeedScenario = 'typical' | 'peak';

/** Resolve the scenario from SEED_SCENARIO (default 'typical'). */
export function resolveScenario(raw: string | undefined): SeedScenario {
  return raw?.trim().toLowerCase() === 'peak' ? 'peak' : 'typical';
}

/** Target ready-pool size per scenario — the real median / max daily volume. */
export const SCENARIO_TARGET: Record<SeedScenario, number> = {
  typical: 171,
  peak: 315,
};

// --- Deterministic PRNG (mulberry32) --------------------------------------

/** Tiny, fast, fully deterministic 32-bit PRNG. Same seed → same stream. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick: entries are [value, weight]; weights need not sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
}

function makeRng(seed: number): Rng {
  const r = mulberry32(seed);
  const next = (): number => r();
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error('[seed] pick from empty array');
    return item;
  };
  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll < 0) return value;
    }
    const last = entries[entries.length - 1];
    if (last === undefined) throw new Error('[seed] weighted pick from empty array');
    return last[0];
  };
  return { next, int, pick, weighted };
}

// --- Team (RBAC users + shift patterns) -----------------------------------

export interface ShiftModel {
  model: string;
  start: string;
  end: string;
  breakMinutes: number;
}

export interface SeedUser {
  employeeNo: string;
  displayName: string;
  email: string;
  role: 'teamlead' | 'employee';
  /** Temporäre Kraft (Azubi/Aushilfe): measured=false → out of Leistungsmessung. */
  measured?: boolean;
  /** Skill-Stufe (A10): starter/dummy = nur manuelle Zuteilung, kein Auto-Plan. */
  skillTier?: SkillTier;
  /** Arbeitsplatz/Tisch (Workstation-Code, A10); undefined = flexibel. */
  workstationCode?: string;
  bereiche?: string[];
  productivityFactor?: number;
  /** Mo–Fr shift model; capacity is derived from this. */
  pattern?: ShiftModel;
}

const FRUEH: ShiftModel = { model: 'Frühschicht', start: '06:00', end: '14:00', breakMinutes: 30 };
const SPAET: ShiftModel = { model: 'Spätschicht', start: '10:00', end: '18:00', breakMinutes: 30 };

/**
 * PIN every seeded user whose role demands one (Teamlead/Admin/IT) gets. These
 * are demo data on a pre-pilot deployment and the PIN is handed to the customer
 * as-is; it protects nothing and is not meant to. Mitarbeiter get no PIN at all
 * — see `requiresPin` in `auth/rbac.ts`.
 */
export const PRIVILEGED_DEMO_PIN = '0000';

// A realistic team for ~170–315 Belege/day: 10 working heads across both shifts
// and all three Bereiche, plus two temporäre Kräfte (measured=false). tl-001 and
// ma-101..103 keep their identities so the existing dev login tokens still resolve.
// Skill-Stufen (A10) sind deterministisch verteilt; die beiden temporären Kräfte
// sind starter/dummy → nie auto-beplant, nur manuelle Zuteilung.
export const USERS: SeedUser[] = [
  { employeeNo: 'tl-001', displayName: 'TL Logistik', email: 'tl-001@dev.local', role: 'teamlead' },
  { employeeNo: 'ma-101', displayName: 'Anna Berger', email: 'ma-101@dev.local', role: 'employee', bereiche: ['Hängebahn'], productivityFactor: 1.05, pattern: FRUEH, skillTier: 'profi', workstationCode: 'T1' },
  { employeeNo: 'ma-102', displayName: 'Bernd Voss', email: 'ma-102@dev.local', role: 'employee', bereiche: ['Palette'], productivityFactor: 0.9, pattern: SPAET, skillTier: 'fortgeschritten', workstationCode: 'T2' },
  { employeeNo: 'ma-103', displayName: 'Claudia Reich', email: 'ma-103@dev.local', role: 'employee', bereiche: ['Regal'], productivityFactor: 1.0, pattern: FRUEH, skillTier: 'basis', workstationCode: 'T3' },
  { employeeNo: 'ma-104', displayName: 'Dirk Hansen', email: 'ma-104@dev.local', role: 'employee', bereiche: ['Regal'], productivityFactor: 1.1, pattern: FRUEH, skillTier: 'profi', workstationCode: 'T4' },
  { employeeNo: 'ma-105', displayName: 'Elena Kraus', email: 'ma-105@dev.local', role: 'employee', bereiche: ['Palette'], productivityFactor: 0.95, pattern: FRUEH, skillTier: 'fortgeschritten', workstationCode: 'T5' },
  { employeeNo: 'ma-106', displayName: 'Frank Lorenz', email: 'ma-106@dev.local', role: 'employee', bereiche: ['Hängebahn'], productivityFactor: 1.0, pattern: SPAET, skillTier: 'profi', workstationCode: 'T6' },
  { employeeNo: 'ma-107', displayName: 'Greta Sommer', email: 'ma-107@dev.local', role: 'employee', bereiche: ['Regal'], productivityFactor: 1.0, pattern: SPAET, skillTier: 'basis', workstationCode: 'T7' },
  { employeeNo: 'ma-108', displayName: 'Hakan Yilmaz', email: 'ma-108@dev.local', role: 'employee', bereiche: ['Palette'], productivityFactor: 1.05, pattern: SPAET, skillTier: 'fortgeschritten', workstationCode: 'T8' },
  { employeeNo: 'ma-109', displayName: 'Ines Pohl', email: 'ma-109@dev.local', role: 'employee', bereiche: ['Regal'], productivityFactor: 0.9, pattern: FRUEH, skillTier: 'basis' },
  { employeeNo: 'ma-110', displayName: 'Jonas Weber', email: 'ma-110@dev.local', role: 'employee', bereiche: ['Hängebahn'], productivityFactor: 1.0, pattern: FRUEH, skillTier: 'profi' },
  // Temporäre Kräfte — sichtbar auf dem Board, aber NIE auto-beplant (starter/dummy)
  // und aus der Leistungsmessung ausgeschlossen (measured=false).
  { employeeNo: 'ma-201', displayName: 'Azubi Mara', email: 'ma-201@dev.local', role: 'employee', measured: false, bereiche: ['Regal'], productivityFactor: 0.7, pattern: FRUEH, skillTier: 'starter' },
  { employeeNo: 'ma-202', displayName: 'Aushilfe Tom', email: 'ma-202@dev.local', role: 'employee', measured: false, bereiche: ['Palette'], productivityFactor: 0.75, pattern: SPAET, skillTier: 'dummy' },
];

// --- Location master (storage; Bereich is derived from `kind`) -------------

export interface SeedLocation {
  code: string;
  displayName: string;
  kind: LocationKind;
  zone: string;
  sequenceIndex: number;
}

// A realistic spread of Lagerplätze so the ~170–315 cases land across all three
// Bereiche (Regal / Palette / Hängebahn) with believable lane sizes on the board.
// sequenceIndex drives pickup order (Anhang D). Regal dominates, as in the real
// warehouse; palette + Hängebahn are the smaller specialist Bereiche.
export const LOCATIONS: SeedLocation[] = [
  ...Array.from({ length: 14 }, (_, i): SeedLocation => {
    const n = (i + 1) * 2 + 1; // 3,5,7,…,29
    return { code: `R${n}`, displayName: `Regal ${n}`, kind: 'regal', zone: `Zone ${'AB'[i % 2]}`, sequenceIndex: n };
  }),
  { code: 'PA-1', displayName: 'Palette A/1', kind: 'palette_a', zone: 'Zone C', sequenceIndex: 50 },
  { code: 'PA-2', displayName: 'Palette A/2', kind: 'palette_a', zone: 'Zone C', sequenceIndex: 52 },
  { code: 'PB-4', displayName: 'Palette B/4', kind: 'palette_b', zone: 'Zone C', sequenceIndex: 54 },
  { code: 'PB-7', displayName: 'Palette B/7', kind: 'palette_b', zone: 'Zone C', sequenceIndex: 57 },
  { code: 'PC-2', displayName: 'Palette C/2', kind: 'palette_c', zone: 'Zone C', sequenceIndex: 60 },
  { code: 'PE-1', displayName: 'Palette E/1', kind: 'palette_e', zone: 'Zone C', sequenceIndex: 64 },
  { code: 'HB-5/234', displayName: 'Hängebahn 5/234', kind: 'haengebahn', zone: 'Zone D', sequenceIndex: 70 },
  { code: 'HB-6/118', displayName: 'Hängebahn 6/118', kind: 'haengebahn', zone: 'Zone D', sequenceIndex: 72 },
  { code: 'HB-7/090', displayName: 'Hängebahn 7/090', kind: 'haengebahn', zone: 'Zone D', sequenceIndex: 74 },
  { code: 'D-3', displayName: 'Lagerplatz D-3', kind: 'lagerplatz_d', zone: 'Zone D', sequenceIndex: 83 },
  { code: 'D-9', displayName: 'Lagerplatz D-9', kind: 'lagerplatz_d', zone: 'Zone D', sequenceIndex: 89 },
];

/** Handling surcharge (min) per Bereich, mirroring the engine's effort intuition. */
function handlingExtraMinutes(kind: LocationKind): number {
  if (kind === 'haengebahn') return 4;
  if (kind.startsWith('palette')) return 2;
  return 0;
}

// --- Generated ready cases -------------------------------------------------

export interface GeneratedCase {
  weBelegNo: string;
  deliveryNoteNo: string;
  storageCode: string;
  section: number | null;
  goodsTypeText: GoodsTypeText;
  priorityFlags: PriorityFlag[];
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
  /** Days before SEED_DATE the booking happened (0 = today). */
  bookingOffsetDays: number;
  /** Days after SEED_DATE the goods are due for loading (null = no plan). */
  loadPlanOffsetDays: number | null;
  catManDue: boolean;
  positionCount: number;
  checkMode: CheckMode;
  checkPercentage: number | null;
  branchNo: string;
  shopAreaNo: string;
  floor: string;
}

const SECTION_WEIGHTS: readonly (readonly [number, number])[] = [
  [4, 25], [7, 20], [8, 15], [1, 15], [2, 13], [3, 12],
];
const GOODS_TYPE_WEIGHTS: readonly (readonly [GoodsTypeText, number])[] = [
  ['Vororder', 30], ['Nachorder', 25], ['NOS', 15], ['Sonderposten', 8],
  ['NOOS', 5], ['Extrabestellung', 5], ['NOS_Nachorder', 5], ['Prio', 7],
];
const QUANTITY_BANDS: readonly (readonly [readonly [number, number], number])[] = [
  [[5, 20], 40], [[21, 50], 35], [[51, 100], 18], [[101, 200], 7],
];
const POSITION_WEIGHTS: readonly (readonly [number, number])[] = [
  [1, 55], [2, 25], [3, 12], [4, 5], [5, 3],
];
const CHECK_MODE_WEIGHTS: readonly (readonly [CheckMode, number])[] = [
  ['quantity_only', 45], ['percentage_check', 40], ['full_check', 15],
];
const SHOP_AREAS = ['21', '22', '23', '31', '42'] as const;
const FLOORS = ['EG', '1.OG', '2.OG'] as const;

/**
 * Run-size weights for delivery groups: most Belege arrive alone or in small
 * consecutive runs, with a long tail of big deliveries — reproducing the real
 * run-length histogram (a typical day ≈ 59 runs for 171 Belege, max run ≈ 22;
 * a peak day adds a few 23–40 runs). Same weBelegNo run + shared deliveryNoteNo
 * makes Pkt.1 delivery grouping fire on the board.
 */
function runSizeWeights(scenario: SeedScenario): readonly (readonly [readonly [number, number], number])[] {
  const base: (readonly [readonly [number, number], number])[] = [
    [[1, 1], 48], [[2, 2], 14], [[3, 3], 9], [[4, 4], 8],
    [[5, 8], 11], [[9, 14], 6], [[15, 22], 3],
  ];
  if (scenario === 'peak') base.push([[23, 40], 2]);
  return base;
}

/**
 * Build the day's ready pool for a scenario. Cases are emitted in delivery runs:
 * each run shares one Lagerplatz (hence Bereich), one deliveryNoteNo and a block
 * of consecutive weBelegNo values, while section/quantity/goods-type vary per
 * Beleg. Fully deterministic for a given scenario.
 */
export function generateReadyCases(scenario: SeedScenario): GeneratedCase[] {
  const target = SCENARIO_TARGET[scenario];
  const rng = makeRng(0xc0ffee ^ target);
  const sizeWeights = runSizeWeights(scenario);
  const cases: GeneratedCase[] = [];

  let weCounter = 3_540_000; // mirrors the real "3.54x.xxx" Beleg numbering
  let runSeq = 0;

  while (cases.length < target) {
    runSeq += 1;
    const remaining = target - cases.length;
    const [sizeMin, sizeMax] = rng.weighted(sizeWeights);
    const runSize = Math.min(remaining, rng.int(sizeMin, sizeMax));
    // Gap before this run so runs are NOT accidentally consecutive with each other.
    weCounter += rng.int(2, 40);
    const runStart = weCounter;
    const location = rng.pick(LOCATIONS);
    const deliveryNoteNo = `LS-25-${String(100 + runSeq)}`;
    const shopAreaNo = rng.pick(SHOP_AREAS);

    for (let i = 0; i < runSize; i += 1) {
      const weNum = runStart + i;
      weCounter = weNum;
      const goodsTypeText = rng.weighted(GOODS_TYPE_WEIGHTS);
      const isPrio = goodsTypeText === 'Prio';
      const section = isPrio ? null : rng.weighted(SECTION_WEIGHTS);
      const [qMin, qMax] = rng.weighted(QUANTITY_BANDS);
      const totalQuantity = rng.int(qMin, qMax);
      const positionCount = Math.min(
        rng.weighted(POSITION_WEIGHTS),
        Math.max(1, Math.floor(totalQuantity / 4)),
      );
      const estimatedMinutes = Math.min(
        75,
        Math.max(
          8,
          Math.round(6 + totalQuantity * 0.18 + positionCount * 2.5 + handlingExtraMinutes(location.kind)),
        ),
      );
      const effortPoints = Math.round((estimatedMinutes / 2.2) * 10) / 10;

      const priorityFlags: PriorityFlag[] = [];
      if (isPrio) priorityFlags.push('prio');
      if (rng.next() < 0.03) priorityFlags.push('manual_teamlead_priority');
      if (rng.next() < 0.02 && !priorityFlags.includes('same_day_required')) {
        priorityFlags.push('same_day_required');
      }
      const catManDue = rng.next() < 0.05;

      // Verladeplan sections (1/2/3) get a near-term load date so a realistic
      // share becomes overdue (today ≥ loadPlanDate − overdueLeadDays); daily
      // sections (4/7/8) are mostly same-day flow without a fixed plan date.
      const hasPlan = section !== null && [1, 2, 3].includes(section);
      const loadPlanOffsetDays = hasPlan ? rng.int(0, 4) : null;
      const checkMode = rng.weighted(CHECK_MODE_WEIGHTS);

      cases.push({
        weBelegNo: formatBelegNo(weNum),
        deliveryNoteNo,
        storageCode: location.code,
        section,
        goodsTypeText,
        priorityFlags,
        totalQuantity,
        effortPoints,
        estimatedMinutes,
        bookingOffsetDays: rng.int(0, 5),
        loadPlanOffsetDays,
        catManDue,
        positionCount,
        checkMode,
        // Nur 10/20 % — die Prüfstufen des Katalogs (A5: none/p10/p20/full).
        checkPercentage: checkMode === 'percentage_check' ? rng.pick([10, 20]) : null,
        branchNo: '001',
        shopAreaNo,
        floor: rng.pick(FLOORS),
      });
      if (cases.length >= target) break;
    }
  }
  return cases;
}

/** Format an integer Beleg number as the customer's dotted "3.540.001" style. */
function formatBelegNo(n: number): string {
  const s = String(n).padStart(7, '0');
  return `${s.slice(0, 1)}.${s.slice(1, 4)}.${s.slice(4)}`;
}
