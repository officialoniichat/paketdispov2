import { ApiProperty } from '@nestjs/swagger';

/** Ergebnis eines Mock-ProHandel-Pulls („Jetzt pullen", A9). */
export class ProhandelPullResultDto {
  @ApiProperty({ description: 'Anzahl neu erzeugter/aufgefrischter Belege' })
  pulledCases!: number;

  @ApiProperty({
    description: 'Davon vom Intake-Gate geblockt (zurück an Bucher, D1)',
  })
  blockedCases!: number;

  @ApiProperty({ type: [String], description: 'WE-Belegnummern der Charge' })
  weBelegNos!: string[];

  @ApiProperty({ description: 'Buchungstag der Charge (ISO)' })
  date!: string;
}
