import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { ClockService } from '../clock/clock.service.js';
import { CaseCollaborationDto } from '../cases/cases.dto.js';
import { TeamleadService } from '../cases/teamlead.service.js';
import { CollaborationService } from './collaboration.service.js';
import {
  CollaborationResultDto,
  ColleagueDto,
  CreateCollaborationDto,
  InviteParticipantsDto,
  ParticipantStatusResultDto,
  PosteingangDto,
  RemoveParticipantDto,
  RespondInvitationDto,
} from './collaboration.dto.js';

/**
 * Mitarbeiter-Seite der Zusammenarbeit (Konzept beleg-zusammenarbeit §7):
 * einladen, antworten, Posteingang, „Teilbeleg erledigt". Jede Prüfung (wer darf
 * was, welcher Beleg-Status) liegt im Service — hier nur Routing.
 */
@ApiTags('me')
@ApiBearerAuth()
@Roles(Role.Employee)
@Controller('api/me')
export class CollaborationController {
  constructor(private readonly collaboration: CollaborationService) {}

  @Get('colleagues')
  @ApiOperation({
    summary:
      'Aktive Kolleg:innen für „Beleg teilen" (ohne den Aufrufer; heute im Dienst zuerst, dann Name)',
  })
  @ApiOkResponse({ type: [ColleagueDto] })
  colleagues(@CurrentUser() principal: Principal): Promise<ColleagueDto[]> {
    return this.collaboration.listColleagues(principal);
  }

  @Post('cases/:caseId/invitations')
  @ApiParam({ name: 'caseId', description: 'Goods-receipt case id' })
  @ApiOperation({
    summary:
      'Kolleg:innen zum geteilten Beleg einladen (Inhaber oder aktiver Beteiligter; Beleg assigned|in_progress|problem_resolved). Abgelehnte/Entfernte werden erneut eingeladen.',
  })
  @ApiOkResponse({ type: CaseCollaborationDto })
  invite(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: InviteParticipantsDto,
  ): Promise<CaseCollaborationDto> {
    return this.collaboration.invite(principal, caseId, dto);
  }

  @Post('invitations/:participantId/respond')
  @ApiParam({
    name: 'participantId',
    description: 'Beteiligungs-Zeile (CaseParticipant) der Einladung',
  })
  @ApiOperation({
    summary:
      'Einladung annehmen (grüner Haken) oder ablehnen (rotes Kreuz) — nur der Eingeladene, nur aus „eingeladen"',
  })
  @ApiOkResponse({ type: ParticipantStatusResultDto })
  respond(
    @CurrentUser() principal: Principal,
    @Param('participantId') participantId: string,
    @Body() dto: RespondInvitationDto,
  ): Promise<ParticipantStatusResultDto> {
    return this.collaboration.respond(principal, participantId, dto);
  }

  @Get('nachrichten')
  @ApiOperation({
    summary:
      'Posteingang: erhaltene/gesendete Einladungen (alle Status) + Teamlead-Nachrichten, neueste zuerst; pendingCount = Zahl am Profilkreis',
  })
  @ApiOkResponse({ type: PosteingangDto })
  nachrichten(@CurrentUser() principal: Principal): Promise<PosteingangDto> {
    return this.collaboration.posteingang(principal);
  }

  @Post('cases/:caseId/part-done')
  @ApiParam({ name: 'caseId', description: 'Goods-receipt case id' })
  @ApiOperation({
    summary:
      '„Teilbeleg erledigt": eigene Beteiligung angenommen → teil_erledigt (Zustand des Beteiligten — keine Beleg-Änderung, keine ZST-Buchung)',
  })
  @ApiOkResponse({ type: ParticipantStatusResultDto })
  partDone(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
  ): Promise<ParticipantStatusResultDto> {
    return this.collaboration.partDone(principal, caseId);
  }
}

/**
 * Teamlead-Seite (Konzept §4/§7): „Gemeinsam zuweisen" und „Aus geteiltem Beleg
 * entfernen". Die Fachlogik lebt im TeamleadService, weil sie dieselbe
 * §8.4-Bündel-Mechanik (findOrCreate/append) und das Auflösen beim Entziehen
 * nutzt — eine Quelle für alle Karren-Bewegungen.
 */
@ApiTags('teamlead')
@ApiBearerAuth()
@Roles(Role.Teamlead, Role.Admin)
@Controller('api/teamlead')
export class TeamleadCollaborationController {
  constructor(
    private readonly teamlead: TeamleadService,
    private readonly clock: ClockService,
  ) {}

  @Post('cases/:caseId/collaboration')
  @ApiParam({ name: 'caseId', description: 'Goods-receipt case id (ready|parked, ohne Bündel)' })
  @ApiOperation({
    summary:
      '„Gemeinsam zuweisen": Beleg in den Karren des ERSTEN Mitarbeiters (§8.4-Pfad), alle Beteiligten angenommen; ein geparkter Beleg wird dabei freigegeben. Pflicht-Grund.',
  })
  @ApiOkResponse({ type: CollaborationResultDto })
  async createCollaboration(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: CreateCollaborationDto,
  ): Promise<CollaborationResultDto> {
    return this.teamlead.createCollaboration(principal, caseId, dto, await this.clock.now());
  }

  @Post('cases/:caseId/participants/:employeeNo/remove')
  @ApiParam({ name: 'caseId', description: 'Goods-receipt case id' })
  @ApiParam({ name: 'employeeNo', description: 'Zu entfernender Helfer' })
  @ApiOperation({
    summary:
      '„Aus geteiltem Beleg entfernen": Helfer → entfernt (Pflicht-Grund). Der Inhaber ist nicht entfernbar (409) — dafür Entziehen/Verschieben.',
  })
  @ApiOkResponse({ type: CollaborationResultDto })
  async removeParticipant(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Param('employeeNo') employeeNo: string,
    @Body() dto: RemoveParticipantDto,
  ): Promise<CollaborationResultDto> {
    return this.teamlead.removeParticipant(
      principal,
      caseId,
      employeeNo,
      dto,
      await this.clock.now(),
    );
  }
}
