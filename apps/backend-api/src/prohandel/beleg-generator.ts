import {
  DEFAULT_WGR_CATALOG,
  SECURITY_PICTOGRAM_CODES,
  type InspectionLevelCode,
} from '@paket/domain-types';

/**
 * Deterministischer Mock-ProHandel-Beleg-Generator (Teamlead-Feedback A9). ProHandel
 * ist System of Record, aber gemockt: der Connector erzeugt Belege mit ALLEN Feldern,
 * die auf dem WE-Beleg-Papier stehen (EAN/Größe/EK/VK/VK-Etikett/Menge, WGR-Klartext,
 * CatMan, Sicherungstyp-Piktogramm, Prüfstufe, Kartonanzahl, Shop/Filiale). Pure
 * Funktionen ohne Uhr/Zufall von außen — derselbe Seed liefert dieselben Belege, damit
 * „Jetzt pullen" und der DB-Seed reproduzierbar bleiben.
 */

/** mulberry32 — kleiner deterministischer PRNG (Seed → [0,1)-Folge). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedSkuLine {
  ean: string;
  size: string;
  expectedQuantity: number;
  ekPrice: number;
  vkPrice: number;
  vkLabelPrice: number;
}

export interface GeneratedPosition {
  positionNo: number;
  wgr: string;
  supplierArticleNo: string;
  supplierColor: string;
  season: string | null;
  nosFlag: boolean;
  /** Ordernummer der Position (ERP-Referenz zur Fehlerlösung, Kundenfeedback 14.07.2026). */
  orderNo: string;
  shopNo: string;
  /** Hauptshop der Position (Anzeige in der Positions-Kopfzeile der PWA). */
  hShopNo: string | null;
  floor: string;
  catMan: boolean;
  /** CatMan-Termin (ISO-Tag), nur gesetzt wenn `catMan` (Kundenfeedback 14.07.2026). */
  catManDate: string | null;
  onlineRelevant: boolean;
  instruction: {
    priceLabelRequired: boolean;
    priceLabelAttachRequired: boolean;
    securityRequired: boolean;
    securityTypeCode: string | null;
    onlineHandlingRequired: boolean;
  };
  skuLines: GeneratedSkuLine[];
}

export interface GeneratedBeleg {
  weBelegNo: string;
  externalRef: string;
  deliveryNoteNo: string | null;
  bookingDate: string;
  branchNo: string;
  primaryShopAreaNo: string;
  primaryShopNo: string;
  primaryFloor: string;
  /** null = Buchung ohne Lagerplatz (Intake-Gate D1 → blocked, „zurück an Bucher"). */
  storageCode: string | null;
  section: number | null;
  goodsTypeText:
    | 'Vororder'
    | 'Nachorder'
    | 'Sonderposten'
    | 'NOS'
    | 'NOOS'
    | 'Extrabestellung'
    | 'NOS_Nachorder'
    | 'Prio';
  priorityFlags: ('prio' | 'manual_teamlead_priority')[];
  totalQuantity: number;
  inboundCartonCount: number;
  inspectionLevelCode: InspectionLevelCode;
  positions: GeneratedPosition[];
  /** Delivery-Group: mehrere Belege einer physischen Lieferung teilen den Key. */
  deliverySourceGroupKey: string | null;
  deliverySourceGroupSize: number | null;
}

const SIZES_BY_VARIANT: Record<string, string[]> = {
  konfektion: ['34', '36', '38', '40', '42', '44'],
  'jeans-inch': ['30/32', '31/32', '32/32', '33/34', '34/34'],
  schuhe: ['39', '40', '41', '42', '43', '44'],
};

const COLORS = ['schwarz', 'navy', 'weiß', 'oliv', 'bordeaux', 'sand'];
const SEASONS = ['HW26', 'FS26', null];
const FLOORS = ['EG', '1.OG', '2.OG'];
/** Shopbereiche inkl. der täglichen Shops 120/90 (Prioritätsleiter Tier 1). */
const SHOP_AREAS = ['21', '22', '31', '90', '120'];
const SHOPS = ['21', '22', '31', '45', '90', '120'];
const GOODS_TYPES: GeneratedBeleg['goodsTypeText'][] = [
  'Vororder',
  'Nachorder',
  'NOS',
  'NOOS',
  'Sonderposten',
  'Extrabestellung',
  'NOS_Nachorder',
];
const INSPECTION_LEVELS: InspectionLevelCode[] = ['none', 'p10', 'p20', 'full'];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Adds `days` to an ISO day string (YYYY-MM-DD) and returns the ISO day. */
function isoDayPlus(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface GenerateOptions {
  /** Deterministic seed (e.g. derived from the current max weBelegNo). */
  seed: number;
  /** How many Belege to generate. */
  count: number;
  /** Numeric start of the weBelegNo sequence, e.g. 137 → WE-2026-000137. */
  startNo: number;
  /** Booking day (ISO date) stamped onto the Belege. */
  bookingDate: string;
  /** Available storage-location codes (from the location master). */
  storageCodes: readonly string[];
}

/**
 * Generate `count` fully-populated mock Belege. Roughly every fourth pair of Belege
 * forms a delivery group („Lieferschein X von N"), and sections/goods types are mixed
 * so the priority ladder and grouping paths are all exercised.
 */
export function generateBelege(options: GenerateOptions): GeneratedBeleg[] {
  const rng = mulberry32(options.seed);
  const belege: GeneratedBeleg[] = [];
  let groupRemaining = 0;
  let groupKey: string | null = null;
  let groupSize: number | null = null;
  let groupNote: string | null = null;

  for (let i = 0; i < options.count; i++) {
    const no = options.startNo + i;
    const weBelegNo = `WE-2026-${String(no).padStart(6, '0')}`;

    // Start a new 2-3 member delivery group roughly every fourth Beleg.
    if (groupRemaining === 0 && rng() < 0.25 && i + 1 < options.count) {
      groupSize = int(rng, 2, 3);
      groupRemaining = Math.min(groupSize, options.count - i);
      groupKey = `PH-LFG-${no}`;
      groupNote = `LS-2026-${String(no).padStart(6, '0')}`;
    }
    const inGroup = groupRemaining > 0;

    const section = pick(rng, [1, 2, 3, 4, 7, 8, null] as const);
    const goodsTypeText = pick(rng, GOODS_TYPES);
    const shopAreaNo = pick(rng, SHOP_AREAS);
    const shopNo = pick(rng, SHOPS);
    const floor = pick(rng, FLOORS);
    const positionCount = int(rng, 1, 4);
    const positions: GeneratedPosition[] = [];
    let totalQuantity = 0;

    for (let p = 1; p <= positionCount; p++) {
      const catalogEntry = pick(rng, DEFAULT_WGR_CATALOG);
      const variant = pick(rng, Object.keys(SIZES_BY_VARIANT));
      const sizes = SIZES_BY_VARIANT[variant]!;
      const lineCount = int(rng, 2, 4);
      const startSize = int(rng, 0, Math.max(0, sizes.length - lineCount));
      const ek = round2(4 + rng() * 40);
      const vk = round2(ek * (2 + rng()));
      const securityRequired = rng() < 0.4;
      const skuLines: GeneratedSkuLine[] = [];
      for (let s = 0; s < lineCount; s++) {
        const expectedQuantity = int(rng, 2, 24);
        totalQuantity += expectedQuantity;
        skuLines.push({
          ean: `40${String(int(rng, 10_000_000, 99_999_999))}${String(no % 100).padStart(2, '0')}${s}`,
          size: sizes[startSize + s] ?? sizes[sizes.length - 1]!,
          expectedQuantity,
          ekPrice: ek,
          vkPrice: vk,
          // VK-Etikett weicht bei Sonderposten/Rotpreis nach unten ab.
          vkLabelPrice: goodsTypeText === 'Sonderposten' ? round2(vk * 0.7) : vk,
        });
      }
      const catMan = rng() < 0.25;
      positions.push({
        positionNo: p,
        wgr: catalogEntry.wgr,
        supplierArticleNo: `ART-${no}${p}`,
        supplierColor: pick(rng, COLORS),
        season: pick(rng, SEASONS),
        nosFlag: goodsTypeText === 'NOS' || goodsTypeText === 'NOS_Nachorder' || rng() < 0.1,
        // Deterministische Mock-Ordernummer je Position (real: ProHandel-Order).
        orderNo: `ORD-${no}-${p}`,
        shopNo,
        // Mock-Hauptshop: der erste Shop der Filiale — real liefert ProHandel den H-Shop.
        hShopNo: SHOPS[0]!,
        floor,
        catMan,
        // CatMan-Termin wenige Tage nach Buchung (deterministisch aus dem RNG).
        catManDate: catMan ? isoDayPlus(options.bookingDate, int(rng, 3, 14)) : null,
        onlineRelevant: rng() < 0.35,
        instruction: {
          priceLabelRequired: true,
          priceLabelAttachRequired: rng() < 0.6,
          securityRequired,
          securityTypeCode: securityRequired ? pick(rng, SECURITY_PICTOGRAM_CODES) : null,
          onlineHandlingRequired: rng() < 0.3,
        },
        skuLines,
      });
    }

    // Intake-Gate-Futter (D1): ein kleiner Anteil der Buchungen kommt unvollständig
    // aus dem ERP — ohne Lagerplatz oder ohne Lieferschein-Nr („zurück an Bucher").
    const missingStorage = !inGroup && rng() < 0.1;
    const missingDeliveryNote = !inGroup && !missingStorage && rng() < 0.08;

    belege.push({
      weBelegNo,
      externalRef: `prohandel:${weBelegNo}`,
      deliveryNoteNo: missingDeliveryNote
        ? null
        : inGroup
          ? groupNote
          : `LS-2026-${String(no).padStart(6, '0')}`,
      bookingDate: options.bookingDate,
      branchNo: '001',
      primaryShopAreaNo: shopAreaNo,
      primaryShopNo: shopNo,
      primaryFloor: floor,
      storageCode: missingStorage ? null : pick(rng, options.storageCodes),
      section,
      goodsTypeText,
      priorityFlags: rng() < 0.08 ? ['prio'] : [],
      totalQuantity,
      inboundCartonCount: Math.max(1, Math.ceil(totalQuantity / int(rng, 20, 40))),
      inspectionLevelCode: pick(rng, INSPECTION_LEVELS),
      positions,
      deliverySourceGroupKey: inGroup ? groupKey : null,
      deliverySourceGroupSize: inGroup ? groupSize : null,
    });

    if (groupRemaining > 0) groupRemaining -= 1;
  }

  return belege;
}
