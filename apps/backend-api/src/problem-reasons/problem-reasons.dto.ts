import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

/** Ein Eintrag des admin-verwalteten Problemarten-Katalogs (Kundenfeedback 14.07.2026). */
export class ProblemReasonDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Anzeigename der Problemart (deutsch)' }) label!: string;
  @ApiProperty({ description: 'Inaktive Gründe sind in der PWA nicht wählbar' }) active!: boolean;
  @ApiProperty({ description: 'Anzeige-Reihenfolge im Auswahlmenü' }) sortOrder!: number;
}

/** Upsert-Zeile für PUT /api/admin/problem-reasons (Replace-all wie Location-Master). */
export class ProblemReasonUpsertDto {
  @ApiPropertyOptional({ description: 'Vorhandene id = Update; ohne id = Neuanlage' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Anzeigename der Problemart' })
  @IsString()
  @MinLength(1)
  label!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ description: 'Anzeige-Reihenfolge' })
  @IsInt()
  sortOrder!: number;
}
