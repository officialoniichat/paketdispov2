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
  summarizeLabelPrintVariants,
  type LabelPrintVariant,
} from '@paket/domain-types';
import type {
  DeliveryGroupRefDto,
  IssueMessageDto,
  IssueSummaryDto,
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
    releasedCount: group.releasedCaseIds.length,
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

/**
 * Welche Etikett-Druckvarianten kommen auf dem Beleg vor (Kundenfeedback 07.08.2026,
 * Kachel-/Zeilen-Infos)? Dedupliziert und in der Anzeige-Reihenfolge — die Ableitung
 * selbst liegt in domain-types ({@link summarizeLabelPrintVariants}), hier wird nur
 * die Positions-Liste auf ihre Varianten reduziert. Positionen ohne gespeicherte
 * Anweisung fallen wie überall auf „Etikett mit Preis" zurück.
 */
export function caseLabelPrintVariants(
  positions: ReadonlyArray<{ instruction?: { labelPrintVariant: LabelPrintVariant } | null }>,
): LabelPrintVariant[] {
  return summarizeLabelPrintVariants(
    positions.map((p) => p.instruction?.labelPrintVariant ?? 'etikett_mit_preis'),
  );
}

/**
 * Sicherung nötig (Kundenfeedback 07.08.2026): mindestens eine Position des Belegs
 * verlangt sie. Bewusst belegweit — die Kachel beantwortet „muss hier gesichert
 * werden?", nicht „wo genau"; das Wo steht in der Arbeitsanweisung.
 */
export function caseSecurityRequired(
  positions: ReadonlyArray<{ instruction?: { securityRequired: boolean } | null }>,
): boolean {
  return positions.some((p) => p.instruction?.securityRequired === true);
}

/**
 * Frühester CatMan-Termin des Belegs (ISO-Tag) — der Termin, bis zu dem die Ware
 * auf der Verkaufsfläche stehen muss. Der Beleg-Kopf trägt ihn nur dort, wo die
 * Quelle ihn belegweit liefert (Seeds/manuell); aus ProHandel kommt er
 * positionsgenau. Diese Aggregation ist die EINE Wahrheit hinter der Anzeige am
 * Beleg (Ware holen + Beleg-Kopf) — die PWA aggregiert nicht selbst.
 *
 * Bewusst reine Kontrollinformation, KEIN Prioritätstreiber (siehe
 * `receiptPositionSchema.catMan` in domain-types): weder Reihenfolge noch
 * Zuteilung hängen daran.
 */
export function earliestCatManDate(
  head: Date | null | undefined,
  positions: ReadonlyArray<{ catManDate: Date | null }> = [],
): string | null {
  const days = [head, ...positions.map((p) => p.catManDate)]
    .filter((d): d is Date => d != null)
    .map((d) => d.toISOString().slice(0, 10));
  return days.length > 0 ? days.reduce((min, day) => (day < min ? day : min)) : null;
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

/** Persistence shape of one Verlaufs-Eintrag (IssueMessage). */
export interface IssueMessageRow {
  id: string;
  kind: string;
  authorRole: string;
  authorName: string;
  text: string;
  createdAt: Date;
}

/** Persistence shape of an Issue row incl. its Verlauf. */
export interface IssueRow {
  id: string;
  scope: string;
  scopeId: string | null;
  kind: string;
  reasonLabel: string | null;
  deviationQty: number | null;
  expectedVkPrice: number | null;
  correctedVkPrice: number | null;
  status: string;
  description: string | null;
  reportedAt: Date;
  messages: IssueMessageRow[];
  /** Katalog-Referenz (nur kind=manual) — liefert die Standardanweisung der Problemart. */
  reason?: { defaultInstruction: string | null; autoInsert: boolean } | null;
}

/** Minimal position context to anchor an issue (id/Nr/Order-Nr + Größenzeilen). */
export interface IssuePositionRef {
  id: string;
  positionNo: number;
  orderNo?: string | null;
  skuLines: ReadonlyArray<{ id: string; ean: string; size: string }>;
}

/**
 * Projects an Issue row + Verlauf for the Klärungs-UX (Kundenfeedback
 * 04.08.2026): Position/Größenzeile werden aus `scopeId` aufgelöst (Anker für
 * die TL-Hinweis-Blöcke der PWA), der Verlauf chronologisch sortiert und der
 * Text der jüngsten Instruktion als Komfortfeld gespiegelt — aber nur solange
 * die Meldung instruiert ist (eine Rückmeldung setzt sie zurück auf offen).
 */
export function mapIssueSummary(
  issue: IssueRow,
  positions: readonly IssuePositionRef[],
): IssueSummaryDto {
  let positionId: string | null = null;
  let positionNo: number | null = null;
  let ean: string | null = null;
  let size: string | null = null;
  let orderNo: string | null = null;
  for (const p of positions) {
    if (issue.scope === 'position' && p.id === issue.scopeId) {
      positionId = p.id;
      positionNo = p.positionNo;
      orderNo = p.orderNo ?? null;
      break;
    }
    const sku = p.skuLines.find((s) => s.id === issue.scopeId);
    if (issue.scope === 'sku_line' && sku) {
      positionId = p.id;
      positionNo = p.positionNo;
      orderNo = p.orderNo ?? null;
      ean = sku.ean;
      size = sku.size;
      break;
    }
  }
  const messages: IssueMessageDto[] = [...issue.messages]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      authorRole: m.authorRole,
      authorName: m.authorName,
      createdAt: m.createdAt.toISOString(),
      text: m.text,
    }));
  const latestInstruction = [...messages].reverse().find((m) => m.kind === 'instruktion') ?? null;
  return {
    id: issue.id,
    scope: issue.scope,
    kind: issue.kind,
    reasonLabel: issue.reasonLabel,
    deviationQty: issue.deviationQty,
    expectedVkPrice: issue.expectedVkPrice,
    correctedVkPrice: issue.correctedVkPrice,
    positionId,
    positionNo,
    ean,
    size,
    orderNo,
    status: issue.status,
    description: issue.description,
    instruction: issue.status === 'instruction_sent' ? (latestInstruction?.text ?? null) : null,
    // Standardanweisung der Problemart (04.08.2026): Vorlage für den
    // Instruktions-Dialog; Auto-Vorbefüllen nur mit gepflegtem Vorlagentext.
    defaultInstruction: issue.reason?.defaultInstruction ?? null,
    defaultInstructionAuto:
      issue.reason?.defaultInstruction != null && (issue.reason?.autoInsert ?? false),
    reportedAt: issue.reportedAt.toISOString(),
    messages,
  };
}
