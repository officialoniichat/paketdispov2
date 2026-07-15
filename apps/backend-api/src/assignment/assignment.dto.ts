import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/**
 * Result of POST /api/me/next-bundle (§continuation, Pull-on-idle). Either a cart
 * was assigned, or `reason` says why not (no_shift | capacity_done | shift_ending |
 * pool_empty | skill_tier | continuation). `shift_ending` (Punkt 6) means the
 * remaining time before shift end is too short to finish another cart — nothing is
 * handed out. An open cart no longer blocks the pull (Kundenfeedback 2026-07-14):
 * the new work is appended to it.
 */
export class NextBundleResultDto {
  @ApiProperty() assigned!: boolean;
  @ApiPropertyOptional({
    description:
      'Why no cart was assigned: no_shift|capacity_done|shift_ending|pool_empty|skill_tier|continuation',
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

/** Result of an assignment run (§8.3). */
export class RecalculateResultDto {
  @ApiProperty() date!: string;
  @ApiProperty() bundleCount!: number;
  @ApiProperty() assignedCaseCount!: number;
  @ApiProperty() unassignedCaseCount!: number;
  @ApiProperty({ description: 'Wall-clock of the engine run (Anhang E.5 budget < 5000ms).' })
  durationMs!: number;
  @ApiProperty({ type: [EmployeeLoadDto] }) loads!: EmployeeLoadDto[];
}
