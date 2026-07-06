import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema, moneySchema } from './primitives.js';
import {
  caseSourceSchema,
  caseStatusSchema,
  checkModeSchema,
  goodsTypeTextSchema,
  inspectionLevelCodeSchema,
  locationTypeSchema,
  priorityFlagSchema,
  sectionCodeSchema,
} from './enums.js';

/** Embedded storage location reference on a case (Anhang A StorageLocation). */
export const storageLocationSchema = z.object({
  id: idSchema,
  type: locationTypeSchema,
  code: z.string(),
  zone: z.string().optional(),
  sequenceIndex: z.number().int().optional(),
  barcode: z.string().optional(),
  active: z.boolean(),
});
export type StorageLocation = z.infer<typeof storageLocationSchema>;

/** Positionsbezogene Aktionen (Anhang A PositionInstruction). */
export const positionInstructionSchema = z.object({
  priceLabelRequired: z.boolean(),
  priceLabelAttachRequired: z.boolean(),
  priceLabelAttachLocation: z.string().optional(),
  securityRequired: z.boolean(),
  securityLocation: z.string().optional(),
  /**
   * Sicherungstyp als Piktogramm-Referenz (Teamlead-Feedback: „Piktogramme liegen auf
   * dem Server"). Code eines Bild-Assets, das das Backend unter
   * `/static/pictograms/<code>.svg` ausliefert (z. B. `hard-tag`, `spider-wrap`).
   */
  securityTypeCode: z.string().optional(),
  onlineHandlingRequired: z.boolean(),
  onlineHandlingLocation: z.string().optional(),
  redPriceRequired: z.boolean().optional(),
  notes: z.string().optional(),
});
export type PositionInstruction = z.infer<typeof positionInstructionSchema>;

/** EAN/size/quantity line (Position != SKU-line, see §6 guardrail). */
export const receiptSkuLineSchema = z.object({
  id: idSchema,
  receiptPositionId: idSchema,
  ean: z.string(),
  size: z.string(),
  expectedQuantity: z.number().int().nonnegative(),
  confirmedQuantity: z.number().int().nonnegative().optional(),
  ekPrice: moneySchema.optional(),
  vkPrice: moneySchema.optional(),
  vkLabelPrice: moneySchema.optional(),
  status: z.enum(['open', 'confirmed', 'deviation']),
});
export type ReceiptSkuLine = z.infer<typeof receiptSkuLineSchema>;

/** Position group on a case; one position spans many SKU lines. */
export const receiptPositionSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  positionNo: z.number().int(),
  wgr: z.string(),
  supplierArticleNo: z.string(),
  supplierColor: z.string(),
  season: z.string().optional(),
  nosFlag: z.boolean().optional(),
  branchNo: z.string(),
  shopNo: z.string(),
  hShopNo: z.string().optional(),
  floor: z.string().optional(),
  onlineRelevant: z.boolean().optional(),
  sustainabilityFlag: z.string().optional(),
  labelType: z.string().optional(),
  /**
   * CatMan-Kennzeichen (Anzeige-Daten aus dem ERP). Bewusst KEIN Prioritätstreiber —
   * die CatMan-Gewichtung bleibt deaktiviert; die UIs zeigen das Feld nur an.
   */
  catMan: z.boolean().optional(),
  instruction: positionInstructionSchema,
  skuLines: z.array(receiptSkuLineSchema),
  status: z.enum(['open', 'confirmed', 'issue_open', 'completed']),
});
export type ReceiptPosition = z.infer<typeof receiptPositionSchema>;

/** Case-wide work instruction header. minimumQuantityCheckAlwaysRequired is true by design. */
export const workInstructionHeaderSchema = z.object({
  caseId: idSchema,
  priceLabelPrintRequired: z.boolean(),
  sortByArticleColorSizeRequired: z.boolean(),
  goodsReceiptCheckMode: checkModeSchema,
  goodsReceiptCheckPercentage: z.number().min(0).max(100).optional(),
  /**
   * Prüfstufe aus dem Katalog (Teamlead-Feedback: Nein/10 %/20 %/Voll statt ja/nein).
   * `goodsReceiptCheckMode`/`goodsReceiptCheckPercentage` werden aus der Stufe
   * abgeleitet; der Katalog liefert den erklärenden Aufgabentext.
   */
  inspectionLevelCode: inspectionLevelCodeSchema.optional(),
  minimumQuantityCheckAlwaysRequired: z.literal(true),
  boxLabelRequired: z.boolean(),
  zstRequired: z.boolean(),
});
export type WorkInstructionHeader = z.infer<typeof workInstructionHeaderSchema>;

/** Digital goods-receipt processing case (Anhang A GoodsReceiptCase). */
export const goodsReceiptCaseSchema = z.object({
  id: idSchema,
  /** ProHandel is the system of record; `manual` is for pilot seeds. */
  source: caseSourceSchema,
  /** Stable reference back to the originating ProHandel booking (idempotency anchor). */
  externalRef: z.string(),
  weBelegNo: z.string(),
  deliveryNoteNo: z.string().optional(),
  /**
   * Delivery-Group T1 signal (Teamlead-Punkt 1). When ProHandel emits „Lieferschein X von N",
   * `deliverySourceGroupKey` is the shared key of that physical delivery and
   * `deliverySourceGroupSize` is N (the expected total) — lets the UI show „3 von 4 da · 1 fehlt".
   */
  deliverySourceGroupKey: z.string().optional(),
  deliverySourceGroupSize: z.number().int().positive().optional(),
  /**
   * Teamlead-Korrektur (lock): when set, this case ignores auto-detection and joins exactly the
   * Belege sharing the same key. `solo:<id>` isolates a case (split/remove); `grp:<key>` merges.
   */
  manualDeliveryGroupKey: z.string().optional(),
  bookingDate: isoDateSchema,
  weDate: isoDateSchema.optional(),
  branchNo: z.string(),
  primaryShopAreaNo: z.string().optional(),
  /**
   * Primärer Shop auf dem Beleg-Kopf (Teamlead-Feedback A7). Mehr-Shop-Belege sind
   * über die Positionen/Transportboxen abgebildet (vollständige Liste); dieses Feld
   * trägt den Haupt-Shop für Listen/Kopf-Anzeige.
   */
  primaryShopNo: z.string().optional(),
  primaryFloor: z.string().optional(),
  /** Anzahl der Kartons, aus denen die Anlieferung besteht (WE-Beleg-Kopf, mock-ERP). */
  inboundCartonCount: z.number().int().positive().optional(),
  /**
   * Lagerplatz des Belegs. Optional NUR für `blocked`-Belege (Intake-Gate D1):
   * ein plan-/verteilbarer Beleg (ready & Co.) hat IMMER einen Lagerplatz — das
   * Gate garantiert es, die Engine verlässt sich darauf.
   */
  storageLocation: storageLocationSchema.optional(),
  section: sectionCodeSchema.nullable(),
  goodsTypeText: goodsTypeTextSchema.optional(),
  priorityFlags: z.array(priorityFlagSchema),
  catManDate: isoDateSchema.optional(),
  loadPlanDate: isoDateSchema.optional(),
  totalQuantity: z.number().int().nonnegative(),
  status: caseStatusSchema,
  effortPoints: z.number().nonnegative(),
  estimatedMinutes: z.number().nonnegative(),
  assignedBundleId: idSchema.optional(),
  /** Archiv (A6): Link ins DocuWare-Langzeitarchiv (mock, gesetzt bei Abschluss). */
  docuWareUrl: z.string().optional(),
  /** TL-Topf (A7): „Besondere Aufmerksamkeit" — Bucherinnen-Inlet (mock). */
  attentionFlag: z.boolean().default(false),
  /** Optionale Notiz zum Aufmerksamkeitsflag (A7). */
  attentionNote: z.string().optional(),
  /** Abschlusszeitpunkt: gesetzt beim Übergang nach completed/zst_done (A6 Archiv). */
  completedAt: isoDateTimeSchema.optional(),
  /** Intake-Gate (D1): fehlende Pflichtfelder eines blocked-Belegs (z. B. Lagerplatz). */
  missingFields: z.array(z.string()).default([]),
  /** Lieferungs-Pool-Hold (D2): TL-Freigabe „trotzdem bearbeiten" für Gruppen-Mitglieder. */
  deliveryGroupReleased: z.boolean().default(false),
  version: z.number().int().nonnegative(),
});
export type GoodsReceiptCase = z.infer<typeof goodsReceiptCaseSchema>;
