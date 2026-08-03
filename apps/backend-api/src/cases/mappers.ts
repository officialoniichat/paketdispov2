/**
 * Shared DTO mappers for the cases module.
 *
 * The employee case view ({@link ./cases.service}) and the teamlead case-detail
 * view ({@link ./teamlead-read.service}) both project the same persistence rows
 * onto the same response DTOs. These are the single source of those two shared
 * projections so the two services don't carry byte-identical private copies.
 */
import type { DeliveryGroup } from '@paket/assignment-engine';
import {
  DEFAULT_INSPECTION_LEVELS,
  DEFAULT_WGR_CATALOG,
  type LabelPrintVariant,
} from '@paket/domain-types';
import type {
  DeliveryGroupRefDto,
  LabelPrintPositionDto,
  PositionInstructionDto,
  SkuLineDto,
  TransportBoxTargetDto,
  WorkInstructionHeaderDto,
} from './cases.dto.js';

/**
 * Project a detected {@link DeliveryGroup} onto the per-case {@link DeliveryGroupRefDto}
 * shown on every surface (Board, Pool, Detail). `missingCount` realises the „X von N"
 * completeness — how many Belege of the delivery have not been booked yet. `label` is
 * the human identity of the delivery (Frage 8: WELCHE Zeilen gehören zusammen): the
 * shared Lieferschein-Nr when all members carry the same one, otherwise the smallest
 * member WE-Nr („ab WE …" — source-key- und Lauf-Gruppen haben je eigene Lieferscheine).
 */
export function mapDeliveryGroupRef(
  group: DeliveryGroup,
  membersById: ReadonlyMap<string, { weBelegNo: string; deliveryNoteNo: string | null }>,
): DeliveryGroupRefDto {
  const missingCount = group.expectedSize
    ? Math.max(0, group.expectedSize - group.presentSize)
    : 0;
  const members = group.caseIds
    .map((id) => membersById.get(id))
    .filter((m): m is { weBelegNo: string; deliveryNoteNo: string | null } => m !== undefined);
  const notes = new Set(
    members.map((m) => m.deliveryNoteNo?.trim()).filter((n): n is string => !!n),
  );
  const label =
    notes.size === 1 ? [...notes][0]! : `ab WE ${members[0]?.weBelegNo ?? group.id}`;
  return {
    id: group.id,
    label,
    signal: group.signal,
    confidence: group.confidence,
    presentSize: group.presentSize,
    expectedSize: group.expectedSize ?? null,
    missingCount,
    locked: group.locked,
    released: group.released,
  };
}

/**
 * Distinct Shops of a Beleg (A3 Mehr-Shop): the primary shop first (Beleg-Kopf),
 * then every further distinct position shop in position order. Empty when the
 * Beleg carries neither a primary shop nor positions.
 */
export function distinctShopNos(
  primaryShopNo: string | null,
  positions: ReadonlyArray<{ shopNo: string }>,
): string[] {
  const shops: string[] = [];
  if (primaryShopNo) shops.push(primaryShopNo);
  for (const p of positions) {
    if (p.shopNo && !shops.includes(p.shopNo)) shops.push(p.shopNo);
  }
  return shops;
}

/**
 * Etikett-Druckvarianten je Position für die Beleg-Zusammenfassung (Kundenfeedback
 * L&T 03.08.2026). Positionen ohne gespeicherte Anweisung fallen auf den bisherigen
 * stillen Standard „Etikett mit Preis" zurück — genau das war der Zustand, den der
 * Kunde bemängelt hat, und er bleibt damit sichtbar statt zu verschwinden.
 */
export function mapLabelPrintPositions(
  positions:
    | ReadonlyArray<{
        positionNo?: number;
        supplierArticleNo?: string;
        supplierColor?: string;
        instruction?: { labelPrintVariant: LabelPrintVariant } | null;
      }>
    | undefined,
): LabelPrintPositionDto[] {
  return (positions ?? [])
    .filter((p): p is typeof p & { positionNo: number } => typeof p.positionNo === 'number')
    .map((p) => ({
      positionNo: p.positionNo,
      supplierArticleNo: p.supplierArticleNo ?? '',
      supplierColor: p.supplierColor ?? '',
      labelPrintVariant: p.instruction?.labelPrintVariant ?? 'etikett_mit_preis',
    }));
}

/** Etiketten nötig (A1): derived from the work-instruction header, false without one. */
export function isLabelsRequired(
  wi: { priceLabelPrintRequired: boolean; boxLabelRequired: boolean } | null | undefined,
): boolean {
  return Boolean(wi && (wi.priceLabelPrintRequired || wi.boxLabelRequired));
}

/**
 * WGR-Klartext (A2). Aufgelöst über die Mock-Stammdaten aus domain-types — der
 * DB-Katalog (WgrCatalog) wird aus DENSELBEN Konstanten geseedet; sobald die echte
 * ProHandel-Anbindung Kataloge liefert, wandert die Auflösung in eine DB-Query.
 */
const WGR_DESCRIPTION_BY_CODE = new Map(DEFAULT_WGR_CATALOG.map((e) => [e.wgr, e.description]));

export function wgrDescription(wgr: string): string | null {
  return WGR_DESCRIPTION_BY_CODE.get(wgr) ?? null;
}

/** Persistence shape of a work-instruction header (the fields both views expose). */
export interface WorkInstructionRow {
  priceLabelPrintRequired: boolean;
  sortByArticleColorSizeRequired: boolean;
  goodsReceiptCheckMode: string;
  goodsReceiptCheckPercentage: number | null;
  inspectionLevelCode: string | null;
  minimumQuantityCheckAlwaysRequired: boolean;
  boxLabelRequired: boolean;
  zstRequired: boolean;
}

/** Project a work-instruction header row onto its response DTO. */
export function mapWorkInstruction(wi: WorkInstructionRow): WorkInstructionHeaderDto {
  // Prüfstufe (A5): Label + Aufgabentext aus dem Katalog auflösen (mock-Stammdaten).
  const level = DEFAULT_INSPECTION_LEVELS.find((l) => l.code === wi.inspectionLevelCode) ?? null;
  return {
    priceLabelPrintRequired: wi.priceLabelPrintRequired,
    sortByArticleColorSizeRequired: wi.sortByArticleColorSizeRequired,
    goodsReceiptCheckMode: wi.goodsReceiptCheckMode,
    goodsReceiptCheckPercentage: wi.goodsReceiptCheckPercentage,
    inspectionLevelCode: wi.inspectionLevelCode,
    inspectionLevelLabel: level?.label ?? null,
    inspectionDescription: level?.description ?? null,
    minimumQuantityCheckAlwaysRequired: wi.minimumQuantityCheckAlwaysRequired,
    boxLabelRequired: wi.boxLabelRequired,
    zstRequired: wi.zstRequired,
  };
}

/** Persistence shape of a transport-box target (the fields both views expose). */
export interface TransportBoxRow {
  id: string;
  boxNo: number;
  branchNo: string;
  shopAreaNo: string;
  shopNo: string | null;
  floor: string | null;
  goodsType: string | null;
  positionIds: string[];
  plannedQuantity: number;
  quantity: number;
  labelStatus: string;
  sealed: boolean;
}

/** Project a transport-box target row onto its response DTO. */
export function mapBoxTarget(b: TransportBoxRow): TransportBoxTargetDto {
  return {
    id: b.id,
    boxNo: b.boxNo,
    branchNo: b.branchNo,
    shopAreaNo: b.shopAreaNo,
    shopNo: b.shopNo,
    floor: b.floor,
    goodsType: b.goodsType,
    positionIds: b.positionIds,
    plannedQuantity: b.plannedQuantity,
    quantity: b.quantity,
    labelStatus: b.labelStatus,
    sealed: b.sealed,
  };
}

/** Persistence shape of a SKU line (the fields both views expose). */
export interface SkuLineRow {
  id: string;
  ean: string;
  size: string;
  expectedQuantity: number;
  confirmedQuantity: number | null;
  ekPrice: number | null;
  vkPrice: number | null;
  vkLabelPrice: number | null;
  status: string;
}

/** Project a SKU-line row onto its response DTO (A8: optional Online-Größen-Markierung). */
export function mapSkuLine(s: SkuLineRow, onlineMark: 'green' | 'red' | null = null): SkuLineDto {
  return {
    id: s.id,
    ean: s.ean,
    size: s.size,
    expectedQuantity: s.expectedQuantity,
    confirmedQuantity: s.confirmedQuantity,
    ekPrice: s.ekPrice,
    vkPrice: s.vkPrice,
    vkLabelPrice: s.vkLabelPrice,
    status: s.status,
    onlineMark,
  };
}

/** Persistence shape of a per-position instruction (Anhang A PositionInstruction). */
export interface PositionInstructionRow {
  labelPrintVariant: LabelPrintVariant;
  priceLabelAttachRequired: boolean;
  priceLabelAttachLocation: string | null;
  securityRequired: boolean;
  securityLocation: string | null;
  securityTypeCode: string | null;
  onlineHandlingRequired: boolean;
  onlineHandlingLocation: string | null;
  redPriceRequired: boolean | null;
  notes: string | null;
}

/** Project a per-position instruction row onto its response DTO. */
export function mapPositionInstruction(i: PositionInstructionRow): PositionInstructionDto {
  return {
    labelPrintVariant: i.labelPrintVariant,
    priceLabelAttachRequired: i.priceLabelAttachRequired,
    priceLabelAttachLocation: i.priceLabelAttachLocation,
    securityRequired: i.securityRequired,
    securityLocation: i.securityLocation,
    securityTypeCode: i.securityTypeCode,
    onlineHandlingRequired: i.onlineHandlingRequired,
    onlineHandlingLocation: i.onlineHandlingLocation,
    redPriceRequired: i.redPriceRequired,
    notes: i.notes,
  };
}
