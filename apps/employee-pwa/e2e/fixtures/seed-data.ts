/**
 * Fixed seed constants shared between `seed.ts` (writes them to the ephemeral
 * Postgres) and `employee-flow.spec.ts` (asserts on them). Keeping these as
 * plain static constants — rather than handing back DB-generated ids through
 * a file/global — is enough because the spec only ever asserts on rendered
 * TEXT (weBelegNo, locationCode, EAN, Preise), never on an internal id.
 *
 * Jeder Mitarbeiter bekommt EIN Bündel, dessen RouteStops sich 1:1 aus `stops`
 * ergeben. Die Kundenforderungen brauchen unterschiedliche Zuschnitte:
 *
 * - `MA_101` — ein Stop, zwei Belege: einer MIT, einer OHNE Etikettendruck
 *   (Forderung 5) sowie der einzige Beleg mit Positionen (Forderungen 6–8).
 * - `MA_102` — eigener Stop, eigener Beleg: belegt die Mitarbeiter-Trennung.
 * - `MA_103` — drei Stops: Mehrfachauswahl beim „Ware holen" (Forderung 3).
 * - `MA_104` — drei Stops, EIGENER Mitarbeiter, weil „Rest parken" den
 *   Serverzustand verändert (Belege wandern zurück in den Pool). Kein anderer
 *   Test darf davon abhängen.
 */

/** One Größe (SKU line) of a position; the prices are what the table right-aligns. */
export interface SeedSkuLineSpec {
  ean: string;
  size: string;
  expectedQuantity: number;
  ekPrice: number;
  vkPrice: number;
  vkLabelPrice: number;
}

export interface SeedPositionSpec {
  positionNo: number;
  wgr: string;
  supplierArticleNo: string;
  supplierColor: string;
  season: string;
  shopNo: string;
  catMan: boolean;
  /** Drives the Online-Größen-Markierung (rot/grün chip) on every Größe row. */
  onlineRelevant: boolean;
  priceLabelAttachLocation?: string;
  /** Renders the Sicherungs-Piktogramm `/static/pictograms/<code>.svg`. */
  securityTypeCode?: string;
  securityLocation?: string;
  skuLines: SeedSkuLineSpec[];
}

export interface SeedBelegSpec {
  weBelegNo: string;
  /**
   * Legt einen `WorkInstructionHeader` an und steuert damit den Chip
   * „🏷️ Etiketten drucken" (BundleHomeScreen B3, Zeile 335). `undefined` ⇒ gar
   * kein Header; `/api/me/today` liefert dann `priceLabelPrintRequired: null`.
   * Belege MIT Positionen brauchen zwingend einen Header — der PROCESS-Screen
   * rendert die Arbeitsanweisung daraus.
   */
  priceLabelPrintRequired?: boolean;
  /** Warenart-Chip auf der Beleg-Zeile in „2 · Bearbeiten" (Prisma `GoodsTypeText`). */
  goodsTypeText?: string;
  /** Nur Belege mit Positionen lassen sich sinnvoll im PROCESS-Screen öffnen. */
  positions?: SeedPositionSpec[];
}

/** Ein Lagerplatz = ein RouteStop = eine anklickbare Zeile in „1 · Ware holen". */
export interface SeedStopSpec {
  locationCode: string;
  belege: SeedBelegSpec[];
}

export interface SeedEmployeeSpec {
  employeeNo: string;
  displayName: string;
  stops: SeedStopSpec[];
}

/** Alle WE-Nummern eines Mitarbeiters in Bündel-Reihenfolge. */
export function belegNos(spec: SeedEmployeeSpec): string[] {
  return spec.stops.flatMap((stop) => stop.belege.map((beleg) => beleg.weBelegNo));
}

/** Alle Lagerplätze eines Mitarbeiters in Stop-Reihenfolge. */
export function locationCodes(spec: SeedEmployeeSpec): string[] {
  return spec.stops.map((stop) => stop.locationCode);
}

/**
 * Online-Größen-Präferenz für WGR 218110: `38` ist die bevorzugte Größe und damit
 * die einzige grüne („Onlineartikel-Highlight"); jede andere gelieferte Größe wird
 * rot markiert („Onlineartikel"). Spiegelt `deriveOnlineSizeMarks`.
 */
export const ONLINE_SIZE_PREFERENCE = {
  wgr: '218110',
  sizeVariant: 'default',
  preferredSize: '38',
} as const;

/** Pos 1: online-relevant + gesichert → prüft Online-Chip und Sicherungs-Piktogramm. */
const POSITION_1: SeedPositionSpec = {
  positionNo: 1,
  wgr: ONLINE_SIZE_PREFERENCE.wgr,
  supplierArticleNo: 'ART-4711',
  supplierColor: 'Marine',
  season: 'HW26',
  shopNo: '12',
  catMan: true,
  onlineRelevant: true,
  priceLabelAttachLocation: 'Nackenband',
  securityTypeCode: 'hard-tag',
  securityLocation: 'Innenetikett',
  skuLines: [
    {
      ean: '4001234500011',
      size: '36',
      expectedQuantity: 3,
      ekPrice: 12.5,
      vkPrice: 39.95,
      vkLabelPrice: 39.95,
    },
    {
      ean: '4001234500028',
      size: '38',
      expectedQuantity: 4,
      ekPrice: 12.5,
      vkPrice: 39.95,
      vkLabelPrice: 34.95,
    },
    {
      ean: '4001234500035',
      size: '40',
      expectedQuantity: 2,
      ekPrice: 12.5,
      vkPrice: 39.95,
      vkLabelPrice: 39.95,
    },
  ],
};

/** Pos 2: weder online noch gesichert — belegt, dass die Spalten trotzdem stehen bleiben. */
const POSITION_2: SeedPositionSpec = {
  positionNo: 2,
  wgr: '312400',
  supplierArticleNo: 'ART-4712',
  supplierColor: 'Schwarz',
  season: 'HW26',
  shopNo: '14',
  catMan: false,
  onlineRelevant: false,
  skuLines: [
    {
      ean: '4009876500017',
      size: '32',
      expectedQuantity: 5,
      ekPrice: 24.9,
      vkPrice: 79.95,
      vkLabelPrice: 79.95,
    },
  ],
};

/**
 * Ein Stop, zwei Belege. Der Etikettendruck ist bewusst UNTERSCHIEDLICH gesetzt:
 * Dustin will am Bündel-Home sehen, ob er zum Drucker muss. Wäre das Flag überall
 * gesetzt, trüge der Chip keine Information (Forderung 5).
 */
export const MA_101: SeedEmployeeSpec = {
  employeeNo: 'ma-101',
  displayName: 'Mitarbeiter 101',
  stops: [
    {
      locationCode: 'E2E-R1',
      belege: [
        {
          weBelegNo: 'WE-E2E-101-1',
          priceLabelPrintRequired: true,
          goodsTypeText: 'Vororder',
          positions: [POSITION_1, POSITION_2],
        },
        {
          weBelegNo: 'WE-E2E-101-2',
          priceLabelPrintRequired: false,
          goodsTypeText: 'NOS',
        },
      ],
    },
  ],
};

export const MA_102: SeedEmployeeSpec = {
  employeeNo: 'ma-102',
  displayName: 'Mitarbeiter 102',
  stops: [{ locationCode: 'E2E-R2', belege: [{ weBelegNo: 'WE-E2E-102-1' }] }],
};

/**
 * Drei Stops → Mehrfachauswahl. Beleg 1 trägt Positionen, damit „2 · Bearbeiten"
 * nach dem letzten Haken auch wirklich aufgeht (Forderung 3).
 */
export const MA_103: SeedEmployeeSpec = {
  employeeNo: 'ma-103',
  displayName: 'Mitarbeiter 103',
  stops: [
    {
      locationCode: 'E2E-R3-A',
      belege: [
        { weBelegNo: 'WE-E2E-103-1', priceLabelPrintRequired: true, positions: [POSITION_2] },
      ],
    },
    { locationCode: 'E2E-R3-B', belege: [{ weBelegNo: 'WE-E2E-103-2' }] },
    { locationCode: 'E2E-R3-C', belege: [{ weBelegNo: 'WE-E2E-103-3' }] },
  ],
};

/**
 * Dustins Wagen-Szenario („Ich kann nur 6 auf meinen Wagen packen"): drei Plätze,
 * nicht alles passt auf den Karren. Eigener Mitarbeiter, weil „Rest parken" Belege
 * serverseitig aus dem Bündel löst und damit den Zustand für jeden weiteren Test
 * verändern würde.
 */
export const MA_104: SeedEmployeeSpec = {
  employeeNo: 'ma-104',
  displayName: 'Mitarbeiter 104',
  stops: [
    { locationCode: 'E2E-R4-A', belege: [{ weBelegNo: 'WE-E2E-104-1' }] },
    { locationCode: 'E2E-R4-B', belege: [{ weBelegNo: 'WE-E2E-104-2' }] },
    { locationCode: 'E2E-R4-C', belege: [{ weBelegNo: 'WE-E2E-104-3' }] },
  ],
};

/** No seeded employee has this number — used to prove an unknown one is rejected. */
export const UNKNOWN_EMPLOYEE_NO = 'ma-999';
