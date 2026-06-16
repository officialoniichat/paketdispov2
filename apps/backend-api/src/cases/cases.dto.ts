import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
  @ApiProperty() storageLocationCode!: string;
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

export class TodayResponseDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiPropertyOptional({ type: CurrentBundleDto, nullable: true })
  bundle!: CurrentBundleDto | null;
  @ApiProperty({ type: [CaseSummaryDto] }) cases!: CaseSummaryDto[];
}

// --- Employee case aggregate (PWA CaseAggregate, §9 work screens) -----------

export class WorkInstructionHeaderDto {
  @ApiProperty() priceLabelPrintRequired!: boolean;
  @ApiProperty() sortByArticleColorSizeRequired!: boolean;
  @ApiProperty({ description: 'CheckMode: quantity_only|percentage_check|full_check' })
  goodsReceiptCheckMode!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) goodsReceiptCheckPercentage!: number | null;
  @ApiProperty() minimumQuantityCheckAlwaysRequired!: boolean;
  @ApiProperty() boxLabelRequired!: boolean;
  @ApiProperty() zstRequired!: boolean;
}

export class ReceiptPositionDto {
  @ApiProperty() id!: string;
  @ApiProperty() positionNo!: number;
  @ApiProperty({ description: 'Warengruppe' }) wgr!: string;
  @ApiProperty() supplierArticleNo!: string;
  @ApiProperty() supplierColor!: string;
  @ApiPropertyOptional({ nullable: true }) season!: string | null;
  @ApiProperty() branchNo!: string;
  @ApiProperty() shopNo!: string;
  @ApiPropertyOptional({ nullable: true }) floor!: string | null;
  @ApiProperty({ description: 'PositionStatus: open|confirmed|issue_open|completed' })
  status!: string;
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
}

export class PoolItemDto extends CaseSummaryDto {
  @ApiPropertyOptional({ nullable: true }) assignedEmployeeNo!: string | null;
  @ApiProperty() effortPoints!: number;
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
}

export class BoardRowDto {
  @ApiProperty() employeeNo!: string;
  @ApiProperty() employeeName!: string;
  @ApiProperty() bundleId!: string;
  @ApiProperty() bundleStatus!: string;
  @ApiProperty() plannedEffortMinutes!: number;
  @ApiProperty() capacityMinutes!: number;
  @ApiProperty({ type: [BoardCaseDto] }) cases!: BoardCaseDto[];
  @ApiProperty({ type: [BoardRouteStopDto] }) routeStops!: BoardRouteStopDto[];
}

export class BoardDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiProperty({ type: [BoardRowDto] }) rows!: BoardRowDto[];
  @ApiProperty() reserveMinutes!: number;
}

export class CapacityDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiProperty() plannedEmployees!: number;
  @ApiProperty() netCapacityMinutes!: number;
  @ApiProperty() plannedMinutes!: number;
  @ApiProperty() reserveMinutes!: number;
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

/** One EAN/size line under a position (Anhang A ReceiptSkuLine). */
export class SkuLineDto {
  @ApiProperty() id!: string;
  @ApiProperty() ean!: string;
  @ApiProperty() size!: string;
  @ApiProperty() expectedQuantity!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) confirmedQuantity!: number | null;
  @ApiProperty({ description: 'SkuLineStatus: open|confirmed|deviation' }) status!: string;
}

/**
 * A receipt position enriched with its §13 instruction flags and SKU lines —
 * the teamlead Belegdetails "Positionen" tab (richer than the employee
 * {@link ReceiptPositionDto}, which omits instruction flags + SKU lines).
 */
export class PositionDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() positionNo!: number;
  @ApiProperty({ description: 'Warengruppe' }) wgr!: string;
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

/** A linked original document (Anhang A Document via DocumentSet). */
export class CaseDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'DocumentKind: delivery_note|goods_receipt|work_instruction|unknown' })
  kind!: string;
  @ApiProperty() fileName!: string;
}

/**
 * §10.4 Belegdetails read model: rich header + work instruction + positions
 * (with SKU lines) + transport boxes + linked documents + audit history.
 */
export class CaseDetailDto {
  @ApiProperty({ type: CaseSummaryDto }) case!: CaseSummaryDto;
  @ApiProperty({ description: 'Effort points (Aufwandspunkte)' }) effortPoints!: number;
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
  @ApiProperty({ type: [CaseDocumentDto] }) documents!: CaseDocumentDto[];
  @ApiProperty({ type: [IssueSummaryDto], description: 'Reported problems, newest first' })
  issues!: IssueSummaryDto[];
  @ApiProperty({ type: [ZstSummaryDto], description: 'ZST completion records, oldest first' })
  zstRecords!: ZstSummaryDto[];
  @ApiProperty({ type: [AuditEventDto], description: 'Audit history, newest first' })
  history!: AuditEventDto[];
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

// --- Requests ---------------------------------------------------------------

export class PoolQueryDto {
  @ApiPropertyOptional({ description: 'Filter by CaseStatus' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by section code' })
  @IsOptional()
  @IsInt()
  section?: number;

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

export class ReleaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ManualAssignmentDto {
  @ApiProperty()
  @IsString()
  employeeNo!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  caseIds!: string[];
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
