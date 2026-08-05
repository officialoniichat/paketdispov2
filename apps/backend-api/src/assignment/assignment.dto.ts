import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/**
 * Result of POST /api/me/next-bundle — „nächstes Pack anfordern" (Pull-Prinzip).
 * Either the next pack is now active, or `reason` says why not (pack_open |
 * no_shift | capacity_done | shift_ending | pool_empty | skill_tier | continuation).
 *
 * Zwei Wege führen zu `assigned: true`: ist bereits ein Folge-Pack VORGEPLANT,
 * wird es nur freigeschaltet (nichts wird neu geplant, nichts aus dem Pool
 * gezogen); sonst baut die Engine ein frisches Pack und hängt es ans offene Bündel.
 *
 * `pack_open` heißt: im aktiven Pack liegt noch Arbeit, die der Mitarbeiter selbst
 * erledigen kann. Belege mit noch OFFENEM Problem zählen dabei bewusst nicht — die
 * hängen an der Teamleitung, und der Mitarbeiter soll deswegen nicht stillstehen.
 * `shift_ending` (Punkt 6) means the remaining time before shift end is too short
 * to finish another cart — nothing is handed out.
 */
export class NextBundleResultDto {
  @ApiProperty() assigned!: boolean;
  @ApiPropertyOptional({
    description:
      'Why no cart was assigned: pack_open|no_shift|capacity_done|shift_ending|pool_empty|skill_tier|continuation',
  })
  reason?: string;
  @ApiPropertyOptional({ type: Number, description: 'Belege in the assigned cart' })
  caseCount?: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Bereich of the assigned cart' })
  bereich?: string | null;
}

/** Body for POST /api/teamlead/assignments/recalculate. */
export class RecalculateDto {
  @ApiPropertyOptional({
    description: 'Planning date (YYYY-MM-DD). Defaults to today.',
    example: '2026-06-15',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}

/** Per-employee load line for the Teamlead "Neu berechnen" delta. */
export class EmployeeLoadDto {
  @ApiProperty() employeeId!: string;
  @ApiProperty() capacityMinutes!: number;
  @ApiProperty() assignedMinutes!: number;
  @ApiProperty() assignedPoints!: number;
  @ApiProperty() bundleCount!: number;
}

/**
 * One planned Bündel of an engine run, in engine emission order. For preview this
 * is pure Vorschau (nothing persisted) — the Teamlead-Vorverteilung renders these
 * containers; committing happens only via the existing audited assign endpoints.
 */
/** Anzeige-Metadaten eines geplanten Belegs (die UI joint nicht selbst). */
export class PlannedBundleCaseDto {
  @ApiProperty() caseId!: string;
  @ApiProperty() weBelegNo!: string;
  @ApiProperty() teile!: number;
  @ApiProperty() minutes!: number;
}

export class PlannedBundleDto {
  @ApiProperty() bundleId!: string;
  @ApiProperty() employeeId!: string;
  @ApiProperty({ type: [String], description: 'Belege in Abhol-Reihenfolge.' })
  caseIds!: string[];
  @ApiProperty({ type: [PlannedBundleCaseDto], description: 'Selbe Reihenfolge wie caseIds.' })
  cases!: PlannedBundleCaseDto[];
  @ApiProperty() plannedEffortMinutes!: number;
  @ApiProperty() effortPoints!: number;
}

/** Result of an assignment run (§8.3). */
export class RecalculateResultDto {
  @ApiProperty() date!: string;
  @ApiProperty() bundleCount!: number;
  @ApiProperty() assignedCaseCount!: number;
  @ApiProperty() unassignedCaseCount!: number;
  @ApiProperty({ description: 'Wall-clock of the engine run (Anhang E.5 budget < 5000ms).' })
  durationMs!: number;
  @ApiProperty({ type: [EmployeeLoadDto] }) loads!: EmployeeLoadDto[];
  @ApiProperty({ type: [PlannedBundleDto], description: 'Geplante Bündel des Laufs (§8.3).' })
  bundles!: PlannedBundleDto[];
}
