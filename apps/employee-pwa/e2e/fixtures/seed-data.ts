/**
 * Fixed seed constants shared between `seed.ts` (writes them to the ephemeral
 * Postgres) and `employee-flow.spec.ts` (asserts on them). Keeping these as
 * plain static constants — rather than handing back DB-generated ids through
 * a file/global — is enough because the spec only ever asserts on rendered
 * TEXT (weBelegNo, locationCode, EAN, Preise), never on an internal id.
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

export interface SeedEmployeeSpec {
  employeeNo: string;
  displayName: string;
  locationCode: string;
  weBelegNos: string[];
  /** Seeded onto the employee's FIRST Beleg only — the one the table spec opens. */
  positions?: SeedPositionSpec[];
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

export const MA_101: SeedEmployeeSpec = {
  employeeNo: 'ma-101',
  displayName: 'Mitarbeiter 101',
  locationCode: 'E2E-R1',
  weBelegNos: ['WE-E2E-101-1', 'WE-E2E-101-2'],
  positions: [POSITION_1, POSITION_2],
};

export const MA_102: SeedEmployeeSpec = {
  employeeNo: 'ma-102',
  displayName: 'Mitarbeiter 102',
  locationCode: 'E2E-R2',
  weBelegNos: ['WE-E2E-102-1'],
};

/** No seeded employee has this number — used to prove an unknown one is rejected. */
export const UNKNOWN_EMPLOYEE_NO = 'ma-999';
