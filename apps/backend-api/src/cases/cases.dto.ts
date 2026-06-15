import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// --- Responses --------------------------------------------------------------

export class CaseSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() weBelegNo!: string;
  @ApiProperty({ description: 'Anhang A CaseStatus' }) status!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Section 1|2|3|4|7|8, null for prio-only' })
  section!: number | null;
  @ApiProperty({ type: [String] }) priorityFlags!: string[];
  @ApiProperty() totalQuantity!: number;
  @ApiProperty() estimatedMinutes!: number;
  @ApiProperty() storageLocationCode!: string;
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) bookingDate!: string;
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
  @ApiPropertyOptional({ description: 'Projected from payload, if present' })
  action?: string;
  @ApiPropertyOptional({ description: 'Projected from payload, if present' })
  reason?: string;
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

export class EventQueryDto {
  @ApiPropertyOptional({ description: 'Filter by ActorType (system|employee|teamlead|admin)' })
  @IsOptional()
  @IsString()
  actorType?: string;

  @ApiPropertyOptional({ description: 'Filter by entityId' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ default: 50, description: 'Page size 1..200' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
