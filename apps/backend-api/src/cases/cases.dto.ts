import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { FORWARD_RECIPIENTS, type ForwardRecipient } from '@paket/domain-types';

// --- Responses --------------------------------------------------------------

export class CaseSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() weBelegNo!: string;
  @ApiProperty({ description: 'Anhang A CaseStatus' }) status!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Section 1|2|3|4|7|8, null for prio-only',
  })
  section!: number | null;
  @ApiProperty({ type: [String] }) priorityFlags!: string[];
  @ApiProperty() totalQuantity!: number;
  @ApiProperty() estimatedMinutes!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'null nur bei blocked-Belegen (Intake-Gate D1: Lagerplatz fehlt)',
  })
  storageLocationCode!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Lagerklasse (LocationKind: regal|palette_*|haengebahn|…) — Quelle der Bereich-Icons',
  })
  storageLocationKind?: string | null;
  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'Preisetiketten müssen gedruckt werden (Arbeitsanweisung) — Hinweis beim Ware holen',
  })
  priceLabelPrintRequired?: boolean | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Primärer Shop (A7)' })
  primaryShopNo!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Kartons der Anlieferung (A6)' })
  inboundCartonCount!: number | null;
  @ApiProperty({ type: [String], description: 'Intake-Gate: fehlende Pflichtfelder (blocked)' })
  missingFields!: string[];
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) bookingDate!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'GoodsTypeText (Warenart), null if unknown',
  })
  goodsType!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Display name of the assigned employee',
  })
  assignedEmployeeName!: string | null;
  @ApiProperty({ description: 'Filiale (Beleg-Kopf)' }) branchNo!: string;
  @ApiProperty({
    description:
      'Etiketten nötig (abgeleitet: workInstruction.priceLabelPrintRequired || boxLabelRequired)',
  })
  labelsRequired!: boolean;
  @ApiProperty({
    type: [String],
    description: 'Alle Shops des Belegs (distinct über die Positionen, Primär-Shop zuerst)',
  })
  shopNos!: string[];
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Link ins DocuWare-Langzeitarchiv (A6, mock); gesetzt bei Abschluss',
  })
  docuWareUrl!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 Abschlusszeitpunkt (completed/zst_done), sonst null',
  })
  completedAt!: string | null;
  @ApiProperty({ description: 'TL-Topf (A7): „Besondere Aufmerksamkeit" (Bucherinnen-Inlet)' })
  attentionFlag!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Notiz zum Aufmerksamkeitsflag' })
  attentionNote!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Digitale Ablage (C5): Weiterleitungs-Empfänger (retourenabteilung|lieferscheinbucher); null = nicht weitergeleitet',
  })
  forwardedTo!: string | null;
}

/** C4: latest OPEN problem of a Beleg — the Problemfälle-lane card preview. */
export class OpenIssueRefDto {
  @ApiProperty({ description: 'IssueType (Anhang A) of the latest open issue' }) kind!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Issue description/note' })
  note!: string | null;
}

/**
 * A5: where an assigned Beleg sits in its Bündel — powers the „vorbereitet /
 * als nächstes" indicator in the Belege list. `started` = the Bündel already has
 * a Beleg in Arbeit (then the queue is running, not merely prepared).
 */
export class BundleQueueRefDto {
  @ApiProperty() bundleId!: string;
  @ApiProperty() employeeName!: string;
  @ApiProperty({ description: '1-based Position des Belegs in der Bündel-Reihenfolge' })
  position!: number;
  @ApiProperty({ description: 'true = das Bündel hat bereits einen Beleg in Arbeit' })
  started!: boolean;
}

/**
 * Per-case delivery-group summary (Teamlead-Anforderung Punkt 1). Attached to a Beleg
 * wherever it is shown (Board, Pool, Detail) so the „Lieferung ×n" badge + confidence
 * colour + „X von N" completeness render everywhere. `null` ⇒ standalone Beleg.
 */
export class DeliveryGroupRefDto {
  @ApiProperty({ description: 'Delivery-group id' }) id!: string;
  @ApiProperty({ enum: ['source', 'note', 'run', 'manual', 'mixed'] }) signal!: string;
  @ApiProperty({ enum: ['confirmed', 'likely', 'suspected', 'locked'] }) confidence!: string;
  @ApiProperty({ description: 'Belege of this group present in the pool' }) presentSize!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Expected total N from „Lieferschein X von N"; null if unknown',
  })
  expectedSize!: number | null;
  @ApiProperty({ description: 'Missing = max(0, expectedSize − presentSize); 0 if unknown' })
  missingCount!: number;
  @ApiProperty({ description: 'Teamlead-locked (frozen against re-detection)' }) locked!: boolean;
  @ApiProperty({
    description: 'D2 „trotzdem bearbeiten": TL hat die unvollständige Lieferung freigegeben',
  })
  released!: boolean;
}

/** One sibling Beleg of a delivery group, with who currently holds it (Detail panel). */
export class DeliveryGroupMemberDto {
  @ApiProperty() caseId!: string;
  @ApiProperty() weBelegNo!: string;
  @ApiProperty({ description: 'Anhang A CaseStatus' }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) assignedEmployeeName!: string | null;
  @ApiProperty({ description: 'true ⇒ this is the Beleg being viewed' }) isCurrent!: boolean;
}

/** Full delivery-group context for the Belegdetailview (ref + the sibling list). */
export class DeliveryGroupDetailDto extends DeliveryGroupRefDto {
  @ApiProperty({ type: [DeliveryGroupMemberDto], description: 'All siblings, by weBelegNo' })
  members!: DeliveryGroupMemberDto[];
}

export class RouteStopDto {
  @ApiProperty() id!: string;
  @ApiProperty() sequence!: number;
  @ApiProperty() locationCode!: string;
  @ApiProperty() scanRequired!: boolean;
  @ApiProperty() scanned!: boolean;
}

export class CurrentBundleDto {
  @ApiProperty() bundleId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() plannedEffortMinutes!: number;
  @ApiProperty() caseCount!: number;
  @ApiProperty({ type: [RouteStopDto] }) routeStops!: RouteStopDto[];
}

/** Der vom Mitarbeiter belegte Arbeitsplatz (Tisch) — per Login/Scan geclaimt. */
export class MeWorkstationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Tisch-Nr./Barcode, z. B. "T-04"' }) code!: string;
  @ApiProperty() name!: string;
}

export class TodayResponseDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiPropertyOptional({ type: CurrentBundleDto, nullable: true })
  bundle!: CurrentBundleDto | null;
  @ApiProperty({ type: [CaseSummaryDto] }) cases!: CaseSummaryDto[];
  @ApiPropertyOptional({
    type: MeWorkstationDto,
    nullable: true,
    description: 'Aktuell geclaimter Arbeitsplatz (Tisch) des Mitarbeiters',
  })
  workstation!: MeWorkstationDto | null;
}

/** Tisch-Anmeldung: der Mitarbeiter identifiziert seinen Arbeitsplatz (Nr. oder Scan). */
export class ClaimWorkstationDto {
  @ApiProperty({ description: 'Workstation-Code (Tisch-Nr. oder gescannter Barcode)' })
  @IsString()
  code!: string;
}

/**
 * Parkposition (B4): der Mitarbeiter parkt die restlichen, noch nicht begonnenen
 * Belege seines Bündels (Karren voll). Die Belege gehen zurück in den Pool und
 * werden beim nächsten Bündel wieder eingeplant.
 */
export class ParkRemainingDto {
  @ApiProperty({ type: [String], description: 'Zu parkende Belege (müssen assigned + im eigenen Bündel sein)' })
  @IsArray()
  @IsString({ each: true })
  caseIds!: string[];
}

export class ParkRemainingResultDto {
  @ApiProperty() bundleId!: string;
  @ApiProperty({ type: [String] }) parkedCaseIds!: string[];
  @ApiProperty({ type: [String], description: 'Verbleibende Belege des Bündels (in Reihenfolge)' })
  remainingCaseIds!: string[];
  @ApiProperty() plannedEffortMinutes!: number;
}

// --- Employee case aggregate (PWA CaseAggregate, §9 work screens) -----------

export class WorkInstructionHeaderDto {
  @ApiProperty() priceLabelPrintRequired!: boolean;
  @ApiProperty() sortByArticleColorSizeRequired!: boolean;
  @ApiProperty({ description: 'CheckMode: quantity_only|percentage_check|full_check' })
  goodsReceiptCheckMode!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) goodsReceiptCheckPercentage!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Prüfstufe: none|p10|p20|full (A5)' })
  inspectionLevelCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Prüfstufen-Label, z. B. "20 %"' })
  inspectionLevelLabel!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Aufgabentext der Prüfstufe (welche Todos sie bedeutet)',
  })
  inspectionDescription!: string | null;
  @ApiProperty() minimumQuantityCheckAlwaysRequired!: boolean;
  @ApiProperty() boxLabelRequired!: boolean;
  @ApiProperty() zstRequired!: boolean;
}

/** One EAN/size line under a position (Anhang A ReceiptSkuLine). */
export class SkuLineDto {
  @ApiProperty() id!: string;
  @ApiProperty() ean!: string;
  @ApiProperty() size!: string;
  @ApiProperty() expectedQuantity!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) confirmedQuantity!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'EK-Preis (A1)' })
  ekPrice!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'VK-Preis (A1)' })
  vkPrice!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'VK-Etikett-Preis (A1)' })
  vkLabelPrice!: number | null;
  @ApiProperty({ description: 'SkuLineStatus: open|confirmed|deviation' }) status!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['green', 'red'],
    description:
      'Online-Größen-Markierung (A8): green = Onlineartikel-Highlight (bevorzugte/Ausweich-Größe), red = Onlineartikel; null für nicht online-relevante Positionen',
  })
  onlineMark!: 'green' | 'red' | null;
}

/** Per-position Arbeitsanweisung instruction flags (Anhang A PositionInstruction, §G.1). */
export class PositionInstructionDto {
  @ApiProperty() priceLabelRequired!: boolean;
  @ApiProperty() priceLabelAttachRequired!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) priceLabelAttachLocation!: string | null;
  @ApiProperty() securityRequired!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) securityLocation!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Sicherungstyp-Piktogramm: /static/pictograms/<code>.svg (A4)',
  })
  securityTypeCode!: string | null;
  @ApiProperty() onlineHandlingRequired!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) onlineHandlingLocation!: string | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true }) redPriceRequired!: boolean | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
}

/** One ordered point of the printed Arbeitsanweisung (derived projection, §G.1). */
export class WorkInstructionPointDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Printed point number (1,4,5,6,8,9,10,11); null for variants',
  })
  pointNo!: number | null;
  @ApiProperty({ description: 'Stable key: price_label_print|sort|goods_receipt_check|security|…' })
  key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() value!: string;
  @ApiProperty({ description: "Scope: 'header' | 'position'" }) scope!: string;
  @ApiPropertyOptional({ type: [Number] }) positionNos?: number[];
}

export class ReceiptPositionDto {
  @ApiProperty() id!: string;
  @ApiProperty() positionNo!: number;
  @ApiProperty({ description: 'Warengruppe' }) wgr!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'WGR-Klartext, z. B. "D-Bermuda" (A2)' })
  wgrDescription!: string | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'CatMan-Kennzeichen (Anzeige, A3)' })
  catMan!: boolean | null;
  @ApiProperty() supplierArticleNo!: string;
  @ApiProperty() supplierColor!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) season!: string | null;
  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'NOS (Never Out of Stock) article flag',
  })
  nosFlag!: boolean | null;
  @ApiProperty() branchNo!: string;
  @ApiProperty() shopNo!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) floor!: string | null;
  @ApiProperty({ description: 'PositionStatus: open|confirmed|issue_open|completed' })
  status!: string;
  @ApiPropertyOptional({ type: PositionInstructionDto, nullable: true })
  instruction!: PositionInstructionDto | null;
  @ApiProperty({ type: [SkuLineDto] }) skuLines!: SkuLineDto[];
}

/** Mirrors the persisted TransportBox row (Anhang A) — the box target per case. */
export class TransportBoxTargetDto {
  @ApiProperty() id!: string;
  @ApiProperty() boxNo!: number;
  @ApiProperty() branchNo!: string;
  @ApiProperty() shopAreaNo!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) shopNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) floor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'BoxGoodsType' })
  goodsType!: string | null;
  @ApiProperty({ type: [String] }) positionIds!: string[];
  @ApiProperty() plannedQuantity!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty({ description: 'BoxLabelStatus: not_required|pending|printed|reprinted' })
  labelStatus!: string;
  @ApiProperty() sealed!: boolean;
}

export class CaseAggregateDto {
  @ApiProperty({ type: CaseSummaryDto }) case!: CaseSummaryDto;
  @ApiPropertyOptional({ type: WorkInstructionHeaderDto, nullable: true })
  workInstruction!: WorkInstructionHeaderDto | null;
  @ApiProperty({ type: [ReceiptPositionDto] }) positions!: ReceiptPositionDto[];
  @ApiProperty({ type: [TransportBoxTargetDto] }) boxTargets!: TransportBoxTargetDto[];
  @ApiProperty({
    type: [WorkInstructionPointDto],
    description: 'Ordered Arbeitsanweisung points (derived from header + positions)',
  })
  instructionPoints!: WorkInstructionPointDto[];
}

export class PoolItemDto extends CaseSummaryDto {
  @ApiPropertyOptional({ nullable: true }) assignedEmployeeNo!: string | null;
  @ApiProperty() effortPoints!: number;
  @ApiPropertyOptional({
    type: DeliveryGroupRefDto,
    nullable: true,
    description: 'Delivery-group context so groups are visible BEFORE distribution; null if standalone',
  })
  deliveryGroup!: DeliveryGroupRefDto | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "Beleg's fixed Bereich (Hängebahn|Palette|Regal), derived from the Lagerplatz kind; null for non-pickup kinds.",
  })
  bereich!: string | null;
  @ApiPropertyOptional({
    type: BundleQueueRefDto,
    nullable: true,
    description:
      'A5: Position des Belegs in seinem Bündel („vorbereitet · Pos n"); null wenn nicht gebündelt',
  })
  bundleQueue!: BundleQueueRefDto | null;
  @ApiPropertyOptional({
    type: OpenIssueRefDto,
    nullable: true,
    description: 'C4: neuestes OFFENES Problem (Art + Notiz-Vorschau); null ohne offenes Problem',
  })
  openIssue!: OpenIssueRefDto | null;
}

/** Why a looked-up Beleg is not assignable (B1 WE-Nr-Zuweisung). */
export const LOOKUP_REASON_CODES = [
  'not_found',
  'already_assigned',
  'wrong_status',
  'blocked',
] as const;
export type LookupReasonCode = (typeof LOOKUP_REASON_CODES)[number];

/**
 * B1: result of the WE-Belegnummer lookup behind the board's Zuweisen dialog.
 * `assignable` = the Beleg is `ready` and unassigned; otherwise `reasonCode`
 * explains the verdict so the dialog can render an inline validation message.
 */
export class CaseLookupResultDto {
  @ApiProperty() found!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) caseId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) weBelegNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Anhang A CaseStatus' })
  status!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Fester Bereich des Belegs (Hängebahn|Palette|Regal), aus der Lagerklasse',
  })
  bereich!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Teile (totalQuantity)' })
  teile!: number | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Geschätzte Bearbeitungsminuten — für die Bündel-Kapazitätsprüfung (A1).',
  })
  estimatedMinutes!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  assignedEmployeeName!: string | null;
  @ApiProperty({ description: 'true = ready und noch keinem Mitarbeiter zugeteilt' })
  assignable!: boolean;
  @ApiPropertyOptional({
    enum: LOOKUP_REASON_CODES,
    nullable: true,
    description: 'Warum nicht zuweisbar; null wenn assignable',
  })
  reasonCode!: LookupReasonCode | null;
  @ApiPropertyOptional({ type: DeliveryGroupRefDto, nullable: true })
  deliveryGroup!: DeliveryGroupRefDto | null;
}

export class PoolListDto {
  @ApiProperty({ type: [PoolItemDto] }) items!: PoolItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class DashboardDto {
  @ApiProperty({ description: 'Open case count grouped by status' })
  countsByStatus!: Record<string, number>;
  @ApiProperty() poolSize!: number;
  @ApiProperty() prioOpen!: number;
  @ApiPropertyOptional({ nullable: true, description: 'Booking date of oldest open case' })
  oldestOpenBookingDate!: string | null;
  @ApiProperty({
    description:
      'Non-terminal Belege assigned to an employee whose shift has already ended (Punkt 6 — offen am Schichtende).',
  })
  endOfShiftOpenCount!: number;
}

// --- Teamlead read endpoints (board / capacity / kpis / events) -------------

export class BoardRouteStopDto {
  @ApiProperty() id!: string;
  @ApiProperty() sequence!: number;
  @ApiProperty() locationCode!: string;
  @ApiProperty() scanRequired!: boolean;
  @ApiProperty() scanned!: boolean;
}

export class BoardCaseDto {
  @ApiProperty() id!: string;
  @ApiProperty() weBelegNo!: string;
  @ApiProperty() status!: string;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty() estimatedMinutes!: number;
  @ApiProperty() effortPoints!: number;
  @ApiPropertyOptional({
    type: DeliveryGroupRefDto,
    nullable: true,
    description: 'Delivery-group context (Teamlead-Anforderung Punkt 1); null if standalone',
  })
  deliveryGroup!: DeliveryGroupRefDto | null;
}

export class BoardRowDto {
  @ApiProperty() employeeNo!: string;
  @ApiProperty() employeeName!: string;
  @ApiProperty({
    description:
      "Skill-Stufe des Mitarbeiters (profi|fortgeschritten|basis|starter|dummy, B5); starter/dummy erhalten nur manuelle Zuteilung.",
  })
  skillTier!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Assigned bundle id; null for a scheduled-but-idle employee with no Bündel.',
  })
  bundleId!: string | null;
  @ApiProperty({ description: "Bundle status, or 'idle' when the employee has no Bündel." })
  bundleStatus!: string;
  @ApiProperty() plannedEffortMinutes!: number;
  @ApiProperty({
    description: 'Σ Teile (totalQuantity) über die zugeteilten Belege — die primäre Last-Anzeige (B3).',
  })
  plannedTeile!: number;
  @ApiProperty() capacityMinutes!: number;
  @ApiProperty({
    type: [String],
    description: 'Fixed Bereiche/skills of the employee (shown on idle rows too).',
  })
  bereiche!: string[];
  @ApiProperty({ type: [BoardCaseDto] }) cases!: BoardCaseDto[];
  @ApiProperty({ type: [BoardRouteStopDto] }) routeStops!: BoardRouteStopDto[];
}

export class BoardDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiProperty({ type: [BoardRowDto] }) rows!: BoardRowDto[];
  @ApiProperty({ description: 'Σ capacity − Σ planned across rows; negative = overbooked.' })
  freeCapacityMinutes!: number;
}

export class CapacityDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiProperty() plannedEmployees!: number;
  @ApiProperty() netCapacityMinutes!: number;
  @ApiProperty() plannedMinutes!: number;
  @ApiProperty({ description: 'net − planned; negative = overbooked.' })
  freeCapacityMinutes!: number;
  @ApiProperty({ description: 'Round 1 decimal, 0 if net capacity = 0' })
  utilisationPct!: number;
}

export class KpiDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiProperty() completedCases!: number;
  @ApiProperty() totalCases!: number;
  @ApiProperty() completedParts!: number;
  @ApiProperty() effortPoints!: number;
  @ApiProperty() workedMinutes!: number;
  @ApiProperty() partsPerHour!: number;
  @ApiProperty() effortPointsPerHour!: number;
}

export class AuditEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Monotonic chain sequence' }) seq!: number;
  @ApiProperty({ description: 'ISO-8601 timestamp' }) at!: string;
  @ApiProperty() actorType!: string;
  @ApiProperty() actorId!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiPropertyOptional({ type: String, description: 'Projected from payload, if present' })
  action?: string;
  @ApiPropertyOptional({ type: String, description: 'Projected from payload, if present' })
  reason?: string;
}

// --- Belegdetails (§10.4 teamlead case detail) ------------------------------

/**
 * A receipt position enriched with its §13 instruction flags and SKU lines —
 * the teamlead Belegdetails "Positionen" tab (richer than the employee
 * {@link ReceiptPositionDto}, which omits instruction flags + SKU lines).
 */
export class PositionDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() positionNo!: number;
  @ApiProperty({ description: 'Warengruppe' }) wgr!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'WGR-Klartext, z. B. "D-Bermuda" (A2)' })
  wgrDescription!: string | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'CatMan-Kennzeichen (Anzeige, A3)' })
  catMan!: boolean | null;
  @ApiProperty() supplierColor!: string;
  @ApiProperty({ description: 'Σ expected over the position SKU lines' }) expectedQuantity!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Σ confirmed over the SKU lines, null if none confirmed yet',
  })
  confirmedQuantity!: number | null;
  @ApiProperty() priceLabelRequired!: boolean;
  @ApiProperty() securityRequired!: boolean;
  @ApiProperty() onlineHandlingRequired!: boolean;
  @ApiProperty({ description: 'PositionStatus: open|confirmed|issue_open|completed' })
  status!: string;
  @ApiProperty({ type: [SkuLineDto] }) skuLines!: SkuLineDto[];
}

/** A problem reported against the case (Anhang A Issue) — the Belegdetail issue list. */
export class IssueSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'IssueScope: case|position|sku_line|transport_box' }) scope!: string;
  @ApiProperty({ description: 'IssueType (Anhang A)' }) issueType!: string;
  @ApiProperty({ description: 'IssueStatus: open|in_review|waiting_external|resolved|rejected' })
  status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolution!: string | null;
  @ApiProperty({ description: 'ISO-8601 timestamp' }) reportedAt!: string;
}

/** One ZST completion record (Anhang A ZstRecord) — the Belegdetail Abschluss tab. */
export class ZstSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Confirmed quantity booked by this ZST' }) completedQuantity!: number;
  @ApiProperty() effortPoints!: number;
  @ApiProperty({ description: 'ISO-8601 timestamp the ZST was set' }) completedAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 timestamp the ZST batch was exported (zst_done), else null',
  })
  exportedAt!: string | null;
  @ApiProperty({ description: 'ZstSource: mobile_app|teamlead_dashboard|manual_import' })
  source!: string;
}

/**
 * §10.4 Belegdetails read model: rich header + work instruction + positions
 * (with SKU lines) + transport boxes + audit history.
 */
/**
 * Per-driver minute breakdown of a case's effort (§8.2), mirroring the engine's
 * EffortComponents. Present only when the effort was computed live from a work instruction.
 */
export class EffortComponentsDto {
  @ApiProperty({ description: 'Grundzeit je Beleg' }) base!: number;
  @ApiProperty({ description: 'Mengenerfassung' }) quantity!: number;
  @ApiProperty({ description: 'Etiketten drucken' }) priceLabelPrint!: number;
  @ApiProperty({ description: 'Etiketten anbringen' }) labelAttach!: number;
  @ApiProperty({ description: 'Warensicherung' }) security!: number;
  @ApiProperty({ description: 'Online-Behandlung' }) online!: number;
  @ApiProperty({ description: 'Rotpreis-Auszeichnung' }) redPrice!: number;
  @ApiProperty({ description: 'Prüfung (Mehraufwand)' }) check!: number;
  @ApiProperty({ description: 'Handling / Füllmaterial' }) handling!: number;
}

export class CaseDetailDto {
  @ApiProperty({ type: CaseSummaryDto }) case!: CaseSummaryDto;
  @ApiProperty({ description: 'Effort points (Aufwandspunkte)' }) effortPoints!: number;
  @ApiProperty({
    description: 'true = Aufwand live aus der Arbeitsanweisung berechnet; false = gespeicherter Schätzwert',
  })
  effortComputed!: boolean;
  @ApiPropertyOptional({
    type: EffortComponentsDto,
    nullable: true,
    description: 'Per-Treiber-Minutenaufschlüsselung; null beim gespeicherten Schätzwert',
  })
  effortComponents!: EffortComponentsDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) deliveryNoteNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) primaryShopAreaNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) primaryFloor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO date YYYY-MM-DD' })
  catManDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO date YYYY-MM-DD' })
  loadPlanDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'GoodsTypeText (Warenart)' })
  goodsType!: string | null;
  @ApiPropertyOptional({ type: WorkInstructionHeaderDto, nullable: true })
  workInstruction!: WorkInstructionHeaderDto | null;
  @ApiProperty({ type: [PositionDetailDto] }) positions!: PositionDetailDto[];
  @ApiProperty({ type: [TransportBoxTargetDto] }) transportBoxes!: TransportBoxTargetDto[];
  @ApiProperty({ type: [IssueSummaryDto], description: 'Reported problems, newest first' })
  issues!: IssueSummaryDto[];
  @ApiProperty({ type: [ZstSummaryDto], description: 'ZST completion records, oldest first' })
  zstRecords!: ZstSummaryDto[];
  @ApiProperty({ type: [AuditEventDto], description: 'Audit history, newest first' })
  history!: AuditEventDto[];
  @ApiPropertyOptional({
    type: DeliveryGroupDetailDto,
    nullable: true,
    description: 'Zugehörige Lieferung (Teamlead-Punkt 1): siblings + who holds them; null if standalone',
  })
  deliveryGroup!: DeliveryGroupDetailDto | null;
}

/** Result of the Tagesabschluss/ZST export (§15.1): completed cases → zst_done + CSV. */
export class ZstExportResultDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD the export ran' }) date!: string;
  @ApiProperty({ description: 'Number of cases moved completed → zst_done' }) exportedCount!: number;
  @ApiProperty({ description: 'RFC 4180 CSV of the exported ZST rows' }) csv!: string;
}

export class TransitionResultDto {
  @ApiProperty() caseId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Audit event id, if a milestone was recorded',
  })
  eventId!: string | null;
}

// --- Intake-Gate (Teamlead-Feedback D1) + Lieferungs-Freigabe (D2) -----------

/** „Zurück an Bucher": mock Queue/Benachrichtigung für einen blocked-Beleg. */
export class ReturnToBucherDto {
  @ApiPropertyOptional({ description: 'Hinweis an den Bucher' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Fehlende Pflichtfelder nachtragen; sind alle da, wird der Beleg ready. */
export class CompleteIntakeDto {
  @ApiPropertyOptional({ description: 'Lagerplatz-Id (Location)' })
  @IsOptional()
  @IsString()
  storageLocationId?: string;

  @ApiPropertyOptional({ description: 'Lieferschein-Nr' })
  @IsOptional()
  @IsString()
  deliveryNoteNo?: string;
}

/** D2 „trotzdem bearbeiten": unvollständige Lieferung explizit freigeben. */
export class DeliveryGroupReleaseDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) caseIds!: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class DeliveryGroupReleaseResultDto {
  @ApiProperty({ type: [String] }) affectedCaseIds!: string[];
}

// --- Requests ---------------------------------------------------------------

/** Lebenszyklus-Scopes der Belege-Ansicht (server-seitig gemappt, A2/A6/A7). */
export const POOL_SCOPES = ['aktiv', 'abgeschlossen', 'archiv', 'topf', 'alle'] as const;
export type PoolScope = (typeof POOL_SCOPES)[number];

/** Server-side sortable Beleg list columns (A2). */
export const POOL_SORT_FIELDS = [
  'weBelegNo',
  'bookingDate',
  'totalQuantity',
  'effortPoints',
  'status',
  'section',
  'branchNo',
  'primaryShopNo',
  'completedAt',
] as const;
export type PoolSortField = (typeof POOL_SORT_FIELDS)[number];

export class PoolQueryDto {
  @ApiPropertyOptional({ description: 'Filter by CaseStatus' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by section code' })
  @IsOptional()
  @IsInt()
  section?: number;

  @ApiPropertyOptional({
    description: 'Volltext: WE-Beleg-Nr / Lagerplatz-Code / Lieferschein-Nr (contains)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter: Shop (primärer Shop, contains)' })
  @IsOptional()
  @IsString()
  shopNo?: string;

  @ApiPropertyOptional({ description: 'Filter: Filiale (contains)' })
  @IsOptional()
  @IsString()
  branchNo?: string;

  @ApiPropertyOptional({ description: 'Filter: fester Bereich (Hängebahn|Palette|Regal)' })
  @IsOptional()
  @IsString()
  bereich?: string;

  @ApiPropertyOptional({ enum: ['yes', 'no'], description: 'Filter: zugeteilt ja/nein' })
  @IsOptional()
  @IsIn(['yes', 'no'])
  assigned?: 'yes' | 'no';

  @ApiPropertyOptional({ enum: ['yes', 'no'], description: 'Filter: Etiketten nötig ja/nein' })
  @IsOptional()
  @IsIn(['yes', 'no'])
  labels?: 'yes' | 'no';

  @ApiPropertyOptional({
    enum: POOL_SCOPES,
    description:
      'Lebenszyklus-Scope (server-seitig): aktiv | abgeschlossen | archiv (completed+zst_done) | topf (Aufmerksamkeit/blocked/needs_review) | alle',
  })
  @IsOptional()
  @IsIn(POOL_SCOPES)
  scope?: PoolScope;

  @ApiPropertyOptional({ description: 'Buchungsdatum ab (YYYY-MM-DD, inklusive)' })
  @IsOptional()
  @IsString()
  bookingFrom?: string;

  @ApiPropertyOptional({ description: 'Buchungsdatum bis (YYYY-MM-DD, inklusive)' })
  @IsOptional()
  @IsString()
  bookingTo?: string;

  @ApiPropertyOptional({ enum: POOL_SORT_FIELDS, description: 'Server-side sort column' })
  @IsOptional()
  @IsIn(POOL_SORT_FIELDS)
  sortBy?: PoolSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Query for GET /api/teamlead/cases/lookup (B1 WE-Nr-Zuweisung). */
export class CaseLookupQueryDto {
  @ApiProperty({ description: 'WE-Belegnummer (exakt, case-insensitive)' })
  @IsString()
  weBelegNo!: string;
}

/** Body for POST /api/teamlead/cases/:caseId/forward — Weiterleiten an … (C5). */
export class ForwardCaseDto {
  @ApiProperty({
    enum: FORWARD_RECIPIENTS,
    description: 'Weiterleitungs-Empfänger (fester Katalog, domain-types forwardRecipientSchema)',
  })
  @IsIn(FORWARD_RECIPIENTS)
  recipient!: ForwardRecipient;

  @ApiPropertyOptional({ description: 'Grund, revisionssicher im case.forwarded-Event' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Body for POST /api/teamlead/cases/:caseId/flag-attention (A7, Bucherinnen-Inlet mock). */
export class FlagAttentionDto {
  @ApiPropertyOptional({ description: 'Optionale Notiz, warum der Beleg Aufmerksamkeit braucht' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateIssueDto {
  @ApiProperty({ description: 'Case the issue is reported against' })
  @IsString()
  caseId!: string;

  @ApiProperty({ description: 'IssueScope: case|position|sku_line|transport_box' })
  @IsString()
  scope!: string;

  @ApiProperty({ description: 'IssueType (Anhang A)' })
  @IsString()
  issueType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  photoKeys?: string[];
}

export class PartialCompleteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  completedQuantity?: number;
}

export class PrioritizeDto {
  @ApiPropertyOptional({ description: 'Reason for manual teamlead priority' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ParkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelDto {
  @ApiPropertyOptional({ description: 'Reason logged in the case.cancelled audit event' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResolveIssueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolution?: string;
}

/**
 * Body for POST /api/teamlead/employees/:employeeNo/assign — manually assign a ready
 * Beleg to an employee. If the employee already has a Bündel for the day the Beleg is
 * appended; if the employee is free the Bündel is created. A §8.4 audited override.
 */
export class AssignToEmployeeDto {
  @ApiProperty({ description: 'Ready Beleg (GoodsReceiptCase) to assign to the employee' })
  @IsString()
  caseId!: string;

  @ApiPropertyOptional({
    description: 'Optional reason logged in the §8.4 audit event (assignment.overridden)',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Target day YYYY-MM-DD; defaults to today (UTC). The Bündel is bound to this day.',
  })
  @IsOptional()
  @IsString()
  date?: string;
}

/** Max Belege per manual multi-assign call — abuse guard, not a business rule. */
export const ASSIGN_BUNDLE_MAX_CASES = 100;

/**
 * Body for POST /api/teamlead/employees/:employeeNo/assign-bundle — manually assign
 * SEVERAL ready Belege to an employee in one atomic call ("Bündel anlegen"). Same
 * find-or-create semantics as {@link AssignToEmployeeDto}: appended to the day's
 * Bündel if the employee already has one, otherwise the Bündel is created and the
 * Belege become its first members, in the given order. All-or-nothing: if ANY
 * caseId fails validation (not found / not ready / already assigned), the whole
 * batch is rolled back and no case is touched — this keeps the manual-assign audit
 * trail meaningful and avoids leaving a Bündel half-built from a batch with a typo.
 */
export class AssignBundleDto {
  @ApiProperty({
    type: [String],
    description: 'Ready Belege to assign, in pickup order (first item = first in a new Bündel)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(ASSIGN_BUNDLE_MAX_CASES)
  @IsString({ each: true })
  caseIds!: string[];

  @ApiPropertyOptional({
    description: 'Optional reason logged in the §8.4 audit event (assignment.overridden)',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Target day YYYY-MM-DD; defaults to today (UTC). The Bündel is bound to this day.',
  })
  @IsOptional()
  @IsString()
  date?: string;
}

/**
 * Body for POST /api/teamlead/bundles/:bundleId/cases/:caseId/move — move one Beleg
 * from its current Bündel straight into another employee's Bündel (find-or-create,
 * same as {@link AssignToEmployeeDto}) in a single atomic step. Only an `assigned`
 * (not yet started) case may be moved — same §7.1 guard as withdraw.
 */
export class MoveCaseDto {
  @ApiProperty({ description: 'employeeNo of the destination employee' })
  @IsString()
  targetEmployeeNo!: string;

  @ApiPropertyOptional({ description: 'Optional reason logged in the §8.4 audit event' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Target day YYYY-MM-DD; defaults to today (UTC). The destination Bündel is bound to this day.',
  })
  @IsOptional()
  @IsString()
  date?: string;
}

/**
 * Body for the Teamlead delivery-group correction (Teamlead-Punkt 1):
 * merge = link these Belege into one locked Lieferung (also used by „bestätigen");
 * split = unlink them (each becomes solo, also used by „entfernen"/„trennen").
 */
export class DeliveryGroupEditDto {
  @ApiProperty({ type: [String], description: 'Cases to merge into / split out of a Lieferung' })
  @IsArray()
  caseIds!: string[];

  @ApiPropertyOptional({ description: 'Reason logged in the audit event' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Result of a delivery-group correction — the locked key (merge) or null (split). */
export class DeliveryGroupEditResultDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'New `grp:` key on merge; null on split' })
  manualGroupKey!: string | null;
  @ApiProperty({ type: [String], description: 'Cases whose grouping was changed' })
  affectedCaseIds!: string[];
}

/** Body for POST /api/teamlead/bundles/:bundleId/withdraw — pull a case out of a bundle. */
export class WithdrawDto {
  @ApiProperty({ description: 'Case to withdraw from the bundle' })
  @IsString()
  caseId!: string;

  @ApiPropertyOptional({ description: 'Reason logged in the §8.4 audit event' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Body for POST /api/teamlead/bundles/:bundleId/add — add a ready case to a bundle. */
export class AddToBundleDto {
  @ApiProperty({ description: 'Ready case to add to the bundle' })
  @IsString()
  caseId!: string;

  @ApiPropertyOptional({ description: 'Reason logged in the §8.4 audit event' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Body for POST /api/teamlead/bundles/:bundleId/reorder — set the item order. */
export class ReorderBundleDto {
  @ApiProperty({ type: [String], description: 'Permutation of the bundle\'s current case ids' })
  @IsArray()
  @IsString({ each: true })
  caseIds!: string[];

  @ApiPropertyOptional({ description: 'Reason logged in the §8.4 audit event' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Body for POST /api/teamlead/bundles/:bundleId/pause|resume — toggle bundle status. */
export class BundlePauseDto {
  @ApiPropertyOptional({ description: 'Reason logged in the §8.4 audit event' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Result of a manual bundle override (§8.4). Reflects the post-mutation state. */
export class BundleMutationResultDto {
  @ApiProperty() bundleId!: string;
  @ApiProperty({ description: 'AssignmentStatus after the mutation' }) bundleStatus!: string;
  @ApiProperty() plannedEffortMinutes!: number;
  @ApiProperty({ type: [String], description: 'Case ids in bundle order' }) caseIds!: string[];
  @ApiPropertyOptional({
    nullable: true,
    description: 'The case touched by this mutation, with its new status',
  })
  caseId!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'CaseStatus of the touched case, if any' })
  caseStatus!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Audit event id, if recorded' })
  eventId!: string | null;
  @ApiPropertyOptional({
    type: Boolean,
    description: 'True when this mutation CREATED the Bündel (employee was free / had none).',
  })
  bundleCreated?: boolean;
}

export class EventQueryDto {
  @ApiPropertyOptional({ description: 'Filter by ActorType (system|employee|teamlead|admin)' })
  @IsOptional()
  @IsString()
  actorType?: string;

  @ApiPropertyOptional({ description: 'Filter by entityId' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated WorkflowEventType allowlist, e.g. ' +
      '"assignment.overridden,case.prioritized,case.parked,case.ready". ' +
      'When set, only events whose eventType is in the list are returned.',
  })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ default: 50, description: 'Page size 1..200' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
