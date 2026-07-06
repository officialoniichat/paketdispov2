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
  @ApiProperty({ description: 'false = temporäre Kraft (ohne Leistungsmessung)' })
  measured!: boolean;
  @ApiProperty({ type: [String] }) bereiche!: string[];
  @ApiProperty() productivityFactor!: number;
  @ApiProperty() overtimeTolerancePct!: number;
  @ApiProperty({
    description:
      'Skill-Stufe: profi | fortgeschritten | basis | starter | dummy — starter/dummy nur manuelle Zuteilung',
  })
  skillTier!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Arbeitsplatz/Tisch (Workstation-Id)' })
  workstationId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Arbeitsplatz-Code, z. B. "T3"' })
  workstationCode!: string | null;
  @ApiPropertyOptional({ type: TodayShiftDto, nullable: true })
  todayShift!: TodayShiftDto | null;
  @ApiProperty({ description: 'Net capacity counted today (0 if inactive/frei)' })
  netCapacityToday!: number;
  @ApiPropertyOptional({ type: WeeklyPatternDto, nullable: true })
  weeklyPattern!: WeeklyPatternDto | null;
}

/** Arbeitsplatz/Tisch (Workstation-Stammdaten, A10) — options for the Admin select. */
export class WorkstationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Natural code, z. B. "T3"' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;
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
  @ApiProperty({ type: [AuditEntryDto] }) recentAudit!: AuditEntryDto[];
}

// --- Write shapes -----------------------------------------------------------

/** PATCH profile. Roles are read-only in this pilot (identity stays in the IdP). */
export class EmployeeProfileUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ description: 'false = temporäre Kraft (ohne Leistungsmessung)' })
  @IsOptional()
  @IsBoolean()
  measured?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bereiche?: string[];
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
  @ApiPropertyOptional({
    description: 'profi | fortgeschritten | basis | starter | dummy',
  })
  @IsOptional()
  @IsString()
  skillTier?: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Arbeitsplatz/Tisch (Workstation-Id); null löst die Zuweisung',
  })
  @IsOptional()
  @IsString()
  workstationId?: string | null;
  @ApiPropertyOptional({ type: WeeklyPatternDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => WeeklyPatternDto)
  weeklyPattern?: WeeklyPatternDto | null;
}

/**
 * Create an employee. The primary use case is registering a temporary worker
 * (Azubi/Saisonaushilfe) the teamlead can manually assign Belege to: `measured`
 * defaults to false so they are excluded from performance KPIs. Regular master data
 * still comes from the IdP; this is the lightweight "schnell anlegen" path.
 * See docs/concept/temporary-workers-concept.md.
 */
export class EmployeeCreateDto {
  @ApiProperty() @IsString() displayName!: string;
  @ApiPropertyOptional({ description: 'Personalnummer; wird sonst automatisch vergeben' })
  @IsOptional()
  @IsString()
  employeeNo?: string;
  @ApiPropertyOptional({ description: 'false = temporäre Kraft (Standard beim Anlegen)' })
  @IsOptional()
  @IsBoolean()
  measured?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bereiche?: string[];
  @ApiPropertyOptional({ description: '0,5…1,2' })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.2)
  productivityFactor?: number;
  @ApiPropertyOptional({
    description: 'profi | fortgeschritten | basis | starter | dummy (Standard beim Anlegen: dummy)',
  })
  @IsOptional()
  @IsString()
  skillTier?: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Arbeitsplatz/Tisch (Workstation-Id)',
  })
  @IsOptional()
  @IsString()
  workstationId?: string | null;
  @ApiPropertyOptional({ type: WeeklyPatternDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => WeeklyPatternDto)
  weeklyPattern?: WeeklyPatternDto | null;
}

