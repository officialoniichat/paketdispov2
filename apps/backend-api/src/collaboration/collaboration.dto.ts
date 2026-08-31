import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CaseParticipantDto } from '../cases/cases.dto.js';

/**
 * DTOs des Zusammenarbeits-Moduls (Konzept beleg-zusammenarbeit §7): Einladen,
 * Antworten, Posteingang „Nachrichten", Teilbeleg erledigt sowie die
 * Teamlead-Seite (Gemeinsam zuweisen / Helfer entfernen). Die geteilten
 * Projektionen CaseParticipantDto/CaseCollaborationDto leben in cases.dto.ts,
 * weil sie auch an CaseSummaryDto/CaseDetailDto/BoardCaseDto hängen.
 */

// --- Mitarbeiter -------------------------------------------------------------

/** Eine aktive Kollegin / ein aktiver Kollege für den „Beleg teilen"-Dialog. */
export class ColleagueDto {
  @ApiProperty() employeeNo!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ description: 'true = heute im Dienst (aktive Schicht mit Kapazität)' })
  shiftToday!: boolean;
}

/** Body für POST /api/me/cases/:caseId/invitations — Kolleg:innen einladen. */
export class InviteParticipantsDto {
  @ApiProperty({ type: [String], description: 'employeeNos der Einzuladenden' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  employeeNos!: string[];

  @ApiPropertyOptional({
    description: 'Nachricht an die Eingeladenen (optional, max. 500 Zeichen)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

/** Body für POST /api/me/invitations/:participantId/respond — Haken oder Kreuz. */
export class RespondInvitationDto {
  @ApiProperty({ description: 'true = annehmen (grüner Haken), false = ablehnen (rotes Kreuz)' })
  @IsBoolean()
  accept!: boolean;
}

/** Ergebnis von Respond/Teilbeleg-erledigt: die eigene Beteiligung nach dem Aufruf. */
export class ParticipantStatusResultDto {
  @ApiProperty() participantId!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty() employeeNo!: string;
  @ApiProperty({
    enum: ['eingeladen', 'angenommen', 'abgelehnt', 'teil_erledigt', 'entfernt'],
    description: 'CaseParticipantStatus nach dem Aufruf',
  })
  status!: string;
}

/** Arten eines Posteingang-Eintrags (Konzept §3.3). */
export const NACHRICHT_KINDS = ['einladung_erhalten', 'einladung_gesendet', 'teamlead'] as const;
export type NachrichtKind = (typeof NACHRICHT_KINDS)[number];

/** Anzeige-Status eines Posteingang-Eintrags. */
export const NACHRICHT_STATUSES = [
  'offen',
  'angenommen',
  'abgelehnt',
  'entfernt',
  'gelesen',
  'ungelesen',
] as const;
export type NachrichtStatus = (typeof NACHRICHT_STATUSES)[number];

/**
 * Ein Eintrag im Posteingang /api/me/nachrichten: erhaltene und gesendete
 * Einladungen (alle Status) sowie Teamlead-Nachrichten — neueste zuerst.
 */
export class NachrichtDto {
  @ApiProperty({ description: 'Beteiligungs-Id (Einladungen) bzw. Nachricht-Id (Teamlead)' })
  id!: string;
  @ApiProperty({ enum: NACHRICHT_KINDS }) kind!: NachrichtKind;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Bezugs-Beleg; null bei Teamlead-Nachricht ohne Bezug',
  })
  caseId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'WE-Nr des Bezugs-Belegs' })
  weBelegNo!: string | null;
  @ApiProperty({ description: 'Absender-Anzeige (Einladender, eigener Name oder „Teamleitung")' })
  fromLabel!: string;
  @ApiProperty({ description: 'Empfänger-Anzeige' }) toLabel!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Nachrichtentext; null ohne Text',
  })
  text!: string | null;
  @ApiProperty({ description: 'ISO-8601 Zeitpunkt (Einladung bzw. Nachricht)' }) createdAt!: string;
  @ApiProperty({
    enum: NACHRICHT_STATUSES,
    description:
      'Einladungen: offen|angenommen|abgelehnt|entfernt (teil_erledigt zählt als angenommen); ' +
      'Teamlead-Nachrichten: gelesen|ungelesen',
  })
  status!: NachrichtStatus;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ISO-8601 Antwort- bzw. Gelesen-Zeitpunkt; null solange offen/ungelesen',
  })
  respondedAt!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Beteiligungs-Id für die Antwort-Tasten; null bei Teamlead-Nachrichten',
  })
  participantId!: string | null;
}

/** Posteingang: Zähler für den Profilkreis + Einträge, neueste zuerst. */
export class PosteingangDto {
  @ApiProperty({
    description:
      'Offene Einladungen an mich + ungelesene Teamlead-Nachrichten — die Zahl am Profilkreis',
  })
  pendingCount!: number;
  @ApiProperty({ type: [NachrichtDto] }) items!: NachrichtDto[];
}

// --- Teamlead ----------------------------------------------------------------

/** Body für POST /api/teamlead/cases/:caseId/collaboration — „Gemeinsam zuweisen". */
export class CreateCollaborationDto {
  @ApiProperty({
    type: [String],
    description:
      'Mindestens zwei Mitarbeitende; der ERSTE ist Inhaber (Beleg landet in seinem Karren)',
  })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  employeeNos!: string[];

  @ApiProperty({ description: 'Pflicht-Grund des Eingriffs (§8.4 Audit)' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** Body für POST /api/teamlead/cases/:caseId/participants/:employeeNo/remove. */
export class RemoveParticipantDto {
  @ApiProperty({ description: 'Pflicht-Grund („Aus geteiltem Beleg entfernen")' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** Zusammenarbeits-Stand nach einem Teamlead-Eingriff. */
export class CollaborationResultDto {
  @ApiProperty() caseId!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'employeeNo des Inhabers (Mitarbeiter des Bündels); null ohne Bündel',
  })
  ownerEmployeeNo!: string | null;
  @ApiProperty({ type: [CaseParticipantDto], description: 'Alle Beteiligten, chronologisch' })
  participants!: CaseParticipantDto[];
}
