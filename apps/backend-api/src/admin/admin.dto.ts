import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * §11 Admin DTOs. Location CRUD-by-replace + the structured RuleConfig the cockpit
 * edits. The deep RuleConfig shape mirrors `@paket/domain-types`' `ruleConfigSchema`
 * (single source of truth); these DTO classes exist only so @nestjs/swagger emits a
 * precise OpenAPI schema for the generated client. The service still re-validates the
 * incoming body with the Zod schema before persisting, so the DTO is documentation,
 * not the trust boundary.
 */

// --- Locations --------------------------------------------------------------

/** A persisted location (Anhang D location master). Mirrors the Prisma `Location`. */
export class LocationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Natural code, e.g. "R27", "HB-5/234"' }) code!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ description: 'LocationKind enum value' }) kind!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) zone!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) sequenceIndex!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) scanCode!: string | null;
  @ApiProperty() active!: boolean;
}

/**
 * One row of the editor's save-the-whole-list payload. `id` is present for an
 * existing location and omitted for a newly added one (the editor uses temporary
 * client ids that are NOT trusted as primary keys — reconciliation is by `code`).
 */
export class LocationUpsertDto {
  @ApiPropertyOptional({ description: 'Server id; omit/ignore for new rows' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() displayName!: string;
  @ApiProperty({ description: 'LocationKind enum value' }) @IsString() kind!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  zone?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  sequenceIndex?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  scanCode?: string | null;

  @ApiProperty() @IsBoolean() active!: boolean;
}

// --- Rule config ------------------------------------------------------------

export class LoadPlanLeadOverrideDto {
  @ApiPropertyOptional({ description: 'Shopbereich; weggelassen = alle' })
  @IsOptional()
  @IsString()
  shopAreaNo?: string;

  @ApiPropertyOptional({ description: 'Abschnitt 1..8; weggelassen = alle' })
  @IsOptional()
  @IsInt()
  section?: number;

  @ApiProperty({ description: 'Vorlauf in Tagen vor dem Verladetag' })
  @IsInt()
  @Min(0)
  leadDays!: number;
}

export class PriorityRuleConfigDto {
  @ApiProperty({ description: 'Default Vorlauf (Tage) vor dem Verladetag bis Überfälligkeit' })
  @IsInt()
  @Min(0)
  overdueLeadDays!: number;

  @ApiProperty({ type: [LoadPlanLeadOverrideDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoadPlanLeadOverrideDto)
  overdueLeadDaysOverrides!: LoadPlanLeadOverrideDto[];

  @ApiProperty() @IsBoolean() fifoEnabled!: boolean;
  @ApiProperty() @IsBoolean() manualPriorityWins!: boolean;
}

export class ReserveRuleConfigDto {
  @ApiProperty() @IsNumber() @Min(0) nextShiftCapacityPct!: number;
  @ApiProperty() @IsNumber() @Min(0) minMinutesPerEmployee!: number;
}

export class BundleRuleConfigDto {
  @ApiProperty() @IsNumber() @Min(0) minMinutes!: number;
  @ApiProperty() @IsNumber() @Min(0) maxMinutes!: number;
  @ApiProperty() @IsInt() @Min(0) maxCases!: number;
  @ApiProperty() @IsInt() @Min(0) maxHeavyCases!: number;
}

export class EffortRuleConfigDto {
  @ApiProperty() @IsNumber() @Min(0) priceLabelPrintFactor!: number;
  @ApiProperty() @IsNumber() @Min(0) securingFactor!: number;
  @ApiProperty() @IsNumber() @Min(0) onlineFactor!: number;
  @ApiProperty() @IsNumber() @Min(0) redPriceFactor!: number;
  @ApiProperty() @IsNumber() @Min(0) checkShareFactor!: number;
  @ApiProperty() @IsNumber() @Min(0) boxSplittingFactor!: number;
}

/** Delivery-Group detection (Teamlead-Anforderung Punkt 1). */
export class GroupingRuleConfigDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({ description: 'Max numeric gap between consecutive weBelegNo (1 = strict run)' })
  @IsInt()
  @Min(0)
  maxWeBelegGap!: number;
}

export class LoadPlanRowDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() shopAreaNo!: string;
  @ApiProperty() @IsString() floor!: string;
  @ApiProperty() @IsString() weekday!: string;
  @ApiProperty({ description: 'ISO date YYYY-MM-DD' }) @IsString() validFrom!: string;
  @ApiPropertyOptional({ description: 'ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  validTo?: string;
  @ApiProperty() @IsBoolean() specialDay!: boolean;
}

/**
 * The whole structured config the cockpit GETs/PUTs. `loadPlan` is a read-only
 * list in the UI; it is accepted on PUT so the round-trip stays lossless, but the
 * cockpit never mutates it.
 */
export class RuleConfigDto {
  @ApiProperty({ type: PriorityRuleConfigDto })
  @ValidateNested()
  @Type(() => PriorityRuleConfigDto)
  priority!: PriorityRuleConfigDto;

  @ApiProperty({ type: ReserveRuleConfigDto })
  @ValidateNested()
  @Type(() => ReserveRuleConfigDto)
  reserve!: ReserveRuleConfigDto;

  @ApiProperty({ type: BundleRuleConfigDto })
  @ValidateNested()
  @Type(() => BundleRuleConfigDto)
  bundle!: BundleRuleConfigDto;

  @ApiProperty({ type: EffortRuleConfigDto })
  @ValidateNested()
  @Type(() => EffortRuleConfigDto)
  effort!: EffortRuleConfigDto;

  @ApiProperty({ type: GroupingRuleConfigDto })
  @ValidateNested()
  @Type(() => GroupingRuleConfigDto)
  grouping!: GroupingRuleConfigDto;

  @ApiProperty({ type: [LoadPlanRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoadPlanRowDto)
  loadPlan!: LoadPlanRowDto[];
}
