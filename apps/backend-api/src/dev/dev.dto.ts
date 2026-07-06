import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/**
 * Dev-panel DTOs (Szenario-Katalog, Zeit-Override, Quick-Knobs). NOT for
 * production use — the whole /api/dev surface is env-gated (DevPanelGuard).
 * Zod at the service boundary stays the trust boundary; these classes exist so
 * @nestjs/swagger emits a precise OpenAPI schema for the generated client.
 */

// --- Scenario catalog ---------------------------------------------------------

export class ScenarioInfoDto {
  @ApiProperty({ description: "Stable catalog key, e.g. 'standard'" }) key!: string;
  @ApiProperty({ description: 'Short human name' }) name!: string;
  @ApiProperty({ description: 'What this scenario sets up' }) description!: string;
  @ApiProperty({ description: '"Was man danach sehen sollte" — headline expectation' })
  expectedOutcome!: string;
}

export class DevScenariosDto {
  @ApiProperty({ type: [ScenarioInfoDto] }) scenarios!: ScenarioInfoDto[];
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Key of the last loaded scenario, or null when the data is not scenario-managed',
  })
  activeScenarioKey!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Active server time override (ISO-8601), or null for real time',
  })
  timeOverride!: string | null;
}

export class ScenarioLoadResultDto {
  @ApiProperty() key!: string;
  @ApiProperty({ description: 'Calendar day (YYYY-MM-DD) the scenario anchored on' })
  baseDate!: string;
  @ApiProperty() users!: number;
  @ApiProperty({ description: 'Active shifts on the base date' }) shifts!: number;
  @ApiProperty() activeLocations!: number;
  @ApiProperty() readyCases!: number;
  @ApiProperty({ description: 'Intake-Gate cases ("zurück an Bucher")' }) blockedCases!: number;
  @ApiProperty({ description: 'Distinct delivery notes across the ready pool' })
  deliveryGroups!: number;
  @ApiProperty() totalCases!: number;
}

// --- Time override ------------------------------------------------------------

export class TimeOverrideDto {
  @ApiProperty({
    description: 'The frozen server "now" as an ISO-8601 timestamp',
    example: '2026-07-06T09:30:00.000Z',
  })
  @IsString()
  now!: string;
}

export class TimeOverrideStateDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Active override (ISO-8601), or null for real time',
  })
  timeOverride!: string | null;
}

// --- Quick knobs ----------------------------------------------------------------

export class MaterializeShiftsDto {
  @ApiProperty({ description: 'Calendar day (YYYY-MM-DD)', example: '2026-07-06' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}

export class MaterializeShiftsResultDto {
  @ApiProperty() date!: string;
  @ApiProperty({ description: 'Active shifts existing for the date after materialization' })
  shiftCount!: number;
}
