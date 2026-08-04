import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body für POST /api/teamlead/messages — Nachricht an die Mitarbeiter-App. */
export class SendMessageDto {
  @ApiProperty({ description: 'employeeNo des Empfängers (Mitarbeiter-App)' })
  @IsString()
  employeeNo!: string;

  @ApiProperty({ description: 'Kurznachricht (max. 500 Zeichen)' })
  @IsString()
  @MaxLength(500)
  text!: string;

  @ApiPropertyOptional({ description: 'Optionaler Beleg-Bezug (GoodsReceiptCase-Id)' })
  @IsOptional()
  @IsString()
  caseId?: string;
}

/** Teamlead-Sicht einer Nachricht inkl. Lesestatus (Sidebar-Ausklapper). */
export class TeamleadMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() employeeNo!: string;
  @ApiProperty() employeeName!: string;
  @ApiProperty({ type: String, nullable: true }) caseId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'WE-Nr des Bezugs-Belegs' })
  weBelegNo!: string | null;
  @ApiProperty() text!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true, description: '„Gelesen"-Quittung aus der PWA' })
  readAt!: string | null;
}

export class TeamleadMessageListDto {
  @ApiProperty({ type: [TeamleadMessageDto] }) messages!: TeamleadMessageDto[];
}

/** Mitarbeiter-Sicht einer UNGELESENEN Nachricht (Banner in der PWA). */
export class MyMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ type: String, nullable: true }) caseId!: string | null;
  @ApiProperty({ type: String, nullable: true }) weBelegNo!: string | null;
  @ApiProperty() createdAt!: string;
}

export class MyMessageListDto {
  @ApiProperty({ type: [MyMessageDto] }) messages!: MyMessageDto[];
}

/** Ergebnis von POST /api/me/messages/:id/read. */
export class MessageReadDto {
  @ApiProperty() id!: string;
  @ApiProperty() readAt!: string;
}
