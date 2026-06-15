import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Mitarbeiter-Einstellungen DTOs (§11 / concept employee-settings-ux). The deep
 * shapes mirror `@paket/domain-types` (employeeProfileSchema / weeklyPatternSchema /
 * absenceSchema), the single source of truth; the service re-validates with Zod, so
 * these classes exist only to emit a precise OpenAPI schema for the generated client.
 */

// --- Weekly pattern ---------------------------------------------------------

export class WeeklyDayPlanDto {
  @ApiProperty() @IsBoolean() working!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() shiftModel?: string;
  @ApiPropertyOptional({ description: 'HH:MM' }) @IsOptional() @IsString() start?: string;
  @ApiPropertyOptional({ description: 'HH:MM' }) @IsOptional() @IsString() end?: string;
  @ApiProperty() @IsInt() @Min(0) breakMinutes!: number;
  @ApiProperty({ description: 'Teilzeit-Anteil 0..100' })
  @IsNumber()
  @Min(0)
  @Max(100)
  partTimePct!: number;
}

export class WeeklyPatternDto {
  @ApiProperty({ type: WeeklyDayPlanDto }) @ValidateNested() @Type(() => WeeklyDayPlanDto) mon!: WeeklyDayPlanDto;
  @ApiProperty({ type: WeeklyDayPlanDto }) @ValidateNested() @Type(() => WeeklyDayPlanDto) tue!: WeeklyDayPlanDto;
  @ApiProperty({ type: WeeklyDayPlanDto }) @ValidateNested() @Type(() => WeeklyDayPlanDto) wed!: WeeklyDayPlanDto;
  @ApiProperty({ type: WeeklyDayPlanDto }) @ValidateNested() @Type(() => WeeklyDayPlanDto) thu!: WeeklyDayPlanDto;
  @ApiProperty({ type: WeeklyDayPlanDto }) @ValidateNested() @Type(() => WeeklyDayPlanDto) fri!: WeeklyDayPlanDto;
  @ApiProperty({ type: WeeklyDayPlanDto }) @ValidateNested() @Type(() => WeeklyDayPlanDto) sat!: WeeklyDayPlanDto;
  @ApiProperty({ type: WeeklyDayPlanDto }) @ValidateNested() @Type(() => WeeklyDayPlanDto) sun!: WeeklyDayPlanDto;
}

// --- Read shapes ------------------------------------------------------------

/** Today's concrete shift, projected for the list/detail header. */
export class TodayShiftDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiProperty({ description: 'HH:MM' }) plannedStart!: string;
  @ApiProperty({ description: 'HH:MM' }) plannedEnd!: string;
  @ApiProperty() breakMinutes!: number;
  @ApiProperty() netCapacityMinutes!: number;
  @ApiProperty({ description: 'seak | pattern | teamlead' }) source!: string;
  @ApiProperty() active!: boolean;
}

export class EmployeeListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() employeeNo!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() active!: boolean;
  @ApiProperty() isPilot!: boolean;
  @ApiProperty({ type: [String] }) areaTags!: string[];
  @ApiProperty() productivityFactor!: number;
  @ApiProperty() overtimeTolerancePct!: number;
  @ApiPropertyOptional({ type: TodayShiftDto, nullable: true })
  todayShift!: TodayShiftDto | null;
  @ApiProperty({ description: 'Absent today (capacity 0)' }) absentToday!: boolean;
  @ApiProperty({ description: 'Net capacity counted today (0 if absent/inactive)' })
  netCapacityToday!: number;
}

/** List response with the team-capacity header the cockpit/list shows. */
export class EmployeeListResponseDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) date!: string;
  @ApiProperty() activeCount!: number;
  @ApiProperty() teamCapacityMinutes!: number;
  @ApiProperty() morningCapacityMinutes!: number;
  @ApiProperty({ type: [EmployeeListItemDto] }) employees!: EmployeeListItemDto[];
}

export class AuditEntryDto {
  @ApiProperty() eventType!: string;
  @ApiProperty() at!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty({ type: Object }) payload!: Record<string, unknown>;
}

export class EmployeeDetailDto extends EmployeeListItemDto {
  @ApiPropertyOptional({ type: WeeklyPatternDto, nullable: true })
  weeklyPattern!: WeeklyPatternDto | null;
  @ApiProperty({ type: [AuditEntryDto] }) recentAudit!: AuditEntryDto[];
}

// --- Write shapes -----------------------------------------------------------

/** PATCH profile. Roles are read-only in this pilot (identity stays in the IdP). */
export class EmployeeProfileUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPilot?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areaTags?: string[];
  @ApiPropertyOptional({ description: '0,5…1,2' })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.2)
  productivityFactor?: number;
  @ApiPropertyOptional({ description: '0…25' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(25)
  overtimeTolerancePct?: number;
  @ApiPropertyOptional({ type: WeeklyPatternDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => WeeklyPatternDto)
  weeklyPattern?: WeeklyPatternDto | null;
}

/** PUT today's (or a given day's) shift — overrides whatever the import produced. */
export class ShiftOverrideDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) @IsString() date!: string;
  @ApiProperty({ description: 'HH:MM' }) @IsString() plannedStart!: string;
  @ApiProperty({ description: 'HH:MM' }) @IsString() plannedEnd!: string;
  @ApiProperty() @IsInt() @Min(0) breakMinutes!: number;
  @ApiPropertyOptional({ description: 'Teilzeit 0..100 (default 100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  partTimePct?: number;
  @ApiProperty() @IsBoolean() active!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class AbsenceCreateDto {
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) @IsString() dateFrom!: string;
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) @IsString() dateTo!: string;
  @ApiProperty({ description: 'krank | urlaub | abwesend | teilabwesend' })
  @IsString()
  kind!: string;
  @ApiPropertyOptional({ description: 'HH:MM cutoff for teilabwesend' })
  @IsOptional()
  @IsString()
  partialUntil?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
