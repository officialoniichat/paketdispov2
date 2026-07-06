import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
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

/** Prioritäts-Konfiguration (Leiter B1/B2 — kein Überfälligkeitsvorlauf mehr). */
export class PriorityRuleConfigDto {
  @ApiProperty({
    type: [String],
    description: 'Shopbereiche mit täglicher Verladung (Tier 1 neben Abschnitten 7/4/8)',
  })
  @IsArray()
  @IsString({ each: true })
  dailyShopAreas!: string[];

  @ApiProperty() @IsBoolean() fifoEnabled!: boolean;
  @ApiProperty() @IsBoolean() manualPriorityWins!: boolean;
}

/** Bündel-Dimensionierung in TEILEN (C1/C2) — ersetzt die min/max-Minuten-Regler. */
export class BundleRuleConfigDto {
  @ApiProperty({ description: 'Starter-Pack min Teile (ca. 200)' })
  @IsInt()
  @Min(1)
  starterPackMinTeile!: number;
  @ApiProperty({ description: 'Starter-Pack max Teile (ca. 250)' })
  @IsInt()
  @Min(1)
  starterPackMaxTeile!: number;
  @ApiProperty({ description: 'Folge-Pack min Teile (ca. 80)' })
  @IsInt()
  @Min(1)
  followUpPackMinTeile!: number;
  @ApiProperty({ description: 'Folge-Pack max Teile (ca. 90)' })
  @IsInt()
  @Min(1)
  followUpPackMaxTeile!: number;
  @ApiProperty({ description: 'Teile-Schwelle für Monster-Belege (manuelle TL-Entscheidung)' })
  @IsInt()
  @Min(1)
  largeBelegTeileThreshold!: number;
}

/** Prüf-Multiplikator je Prüfmodus (§8.2). */
export class CheckModeFactorsDto {
  @ApiProperty() @IsNumber() @Min(0) quantity_only!: number;
  @ApiProperty() @IsNumber() @Min(0) percentage_check!: number;
  @ApiProperty() @IsNumber() @Min(0) full_check!: number;
}

/**
 * Aufwandsparameter (§8.2 / Anhang B.3) — the real engine effort minutes the cockpit
 * edits. Identical shape to `EngineConfig.effort`; the service threads it straight into
 * the engine. (Records are emitted as free-form number maps for the generated client.)
 */
export class EffortRuleConfigDto {
  @ApiProperty() @IsNumber() @Min(0) baseMinutesPerCase!: number;
  @ApiProperty() @IsNumber() @Min(0) quantityBaseMinutes!: number;
  @ApiProperty() @IsNumber() @Min(0) priceLabelPrintMinutes!: number;
  @ApiProperty() @IsNumber() @Min(0) labelAttachMinutesPerPosition!: number;
  @ApiProperty() @IsNumber() @Min(0) securityMinutesPerPosition!: number;
  @ApiProperty() @IsNumber() @Min(0) onlineHandlingMinutesPerPosition!: number;
  @ApiProperty() @IsNumber() @Min(0) redPriceMinutesPerPosition!: number;
  @ApiProperty() @IsNumber() @Min(0) boxSplitMinutesPerBox!: number;
  @ApiProperty({ type: CheckModeFactorsDto })
  @ValidateNested()
  @Type(() => CheckModeFactorsDto)
  checkModeFactors!: CheckModeFactorsDto;
  // @Allow keeps the free-form number maps through the global `whitelist: true`
  // ValidationPipe — without any class-validator decorator they would be stripped
  // and the Zod boundary would reject every PUT. Values are validated by Zod.
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  @Allow()
  handlingClassFactors!: Record<string, number>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  @Allow()
  wgrFactors!: Record<string, number>;
  @ApiProperty() @IsNumber() @Min(0) pointsPerMinute!: number;
}

/**
 * Delivery-Group detection (Teamlead-Anforderung Punkt 1). Full mirror of
 * `groupingRuleConfigSchema` — the global ValidationPipe runs with `whitelist: true`,
 * so every field the Admin form edits MUST be declared here or PUT silently drops it.
 */
export class GroupingRuleConfigDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({ description: 'T1: trust the source group key / „X von N" from ProHandel (bestätigt)' })
  @IsBoolean()
  useSourceKey!: boolean;
  @ApiProperty({ description: 'T2: link Belege sharing the same deliveryNoteNo (wahrscheinlich)' })
  @IsBoolean()
  useDeliveryNote!: boolean;
  @ApiProperty({ description: 'T3: link a consecutive weBelegNo run (vermutet)' })
  @IsBoolean()
  useBelegRun!: boolean;
  @ApiProperty({ description: 'Max numeric gap between consecutive weBelegNo (1 = strict run)' })
  @IsInt()
  @Min(0)
  maxWeBelegGap!: number;
  @ApiProperty({ description: 'Harden T3: a run only links Belege booked on the SAME day' })
  @IsBoolean()
  runRequiresSameDay!: boolean;
  @ApiProperty({ description: 'Harden T3: a run only links Belege of the SAME Bereich/section' })
  @IsBoolean()
  runRequiresSameSection!: boolean;
  @ApiProperty({
    description: 'When false, suspected (T3) groups wait for Teamlead confirm before auto-distribution',
  })
  @IsBoolean()
  autoDistributeSuspected!: boolean;
}

export class ShiftEndRuleConfigDto {
  @ApiProperty({ description: 'Minutes before plannedEnd at which auto-distribution stops (0 = off)' })
  @IsInt()
  @Min(0)
  autoCutoffMinutes!: number;
}

/** Prüfstufen-Steuerung (A5): Quelle der Beleg-Prüfstufe (prohandel | dashboard). */
export class InspectionRuleConfigDto {
  @ApiProperty({ description: 'prohandel | dashboard' }) @IsString() source!: string;
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

  @ApiProperty({ type: ShiftEndRuleConfigDto })
  @ValidateNested()
  @Type(() => ShiftEndRuleConfigDto)
  shiftEnd!: ShiftEndRuleConfigDto;

  @ApiProperty({ type: InspectionRuleConfigDto })
  @ValidateNested()
  @Type(() => InspectionRuleConfigDto)
  inspection!: InspectionRuleConfigDto;

  @ApiProperty({ type: [LoadPlanRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoadPlanRowDto)
  loadPlan!: LoadPlanRowDto[];
}

// --- Mock-ERP catalogs (Teamlead-Feedback A2/A5/A8) ---------------------------

/** WGR-Klartext, z. B. `218110` → „D-Bermuda" (A2). */
export class WgrCatalogEntryDto {
  @ApiProperty() wgr!: string;
  @ApiProperty() description!: string;
}

/** Prüfstufe mit erklärendem Aufgabentext (A5). */
export class InspectionLevelDto {
  @ApiProperty({ description: 'none | p10 | p20 | full' }) code!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'Prüfanteil in Prozent (0..100)' }) percentage!: number;
  @ApiProperty({ description: 'Welche Todos diese Prüfstufe bedeutet' }) description!: string;
}

/** Online-Größen-Präferenz je WGR + Größenvariante (A8). */
export class OnlineSizePreferenceDto {
  @ApiProperty() id!: string;
  @ApiProperty() wgr!: string;
  @ApiProperty({ description: 'Größenvariante, z. B. konfektion | jeans-inch | schuhe' })
  sizeVariant!: string;
  @ApiProperty() preferredSize!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) alternativeSize!: string | null;
}

/**
 * CSV-Upload der Online-Größen-Präferenzen (A8). Semikolon-getrennt mit Kopfzeile
 * `wgr;sizeVariant;preferredSize;alternativeSize`; Upsert-Schlüssel [wgr, sizeVariant].
 */
export class OnlineSizePreferenceUploadDto {
  @ApiProperty({ description: 'CSV-Inhalt (Semikolon-getrennt, mit Kopfzeile)' })
  @IsString()
  csv!: string;
}

export class OnlineSizePreferenceUploadResultDto {
  @ApiProperty() upserted!: number;
  @ApiProperty({ type: [String], description: 'Abgelehnte Zeilen mit Grund' })
  rejectedRows!: string[];
  @ApiProperty({ type: [OnlineSizePreferenceDto] })
  preferences!: OnlineSizePreferenceDto[];
}
