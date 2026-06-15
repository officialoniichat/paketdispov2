import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { RecalculateDto, RecalculateResultDto } from '../assignment/assignment.dto.js';
import { TeamleadService } from './teamlead.service.js';
import {
  AuditEventDto,
  BoardDto,
  CapacityDto,
  DashboardDto,
  EventQueryDto,
  KpiDto,
  ParkDto,
  PoolListDto,
  PoolQueryDto,
  PrioritizeDto,
  ReleaseDto,
  ResolveIssueDto,
  TransitionResultDto,
} from './cases.dto.js';

/** Teamlead pool steering & issue resolution (§14.2). Full operational visibility. */
@ApiTags('teamlead')
@ApiBearerAuth()
@Roles(Role.Teamlead, Role.Admin)
@Controller('api/teamlead')
export class TeamleadController {
  constructor(
    private readonly teamlead: TeamleadService,
    private readonly assignment: AssignmentService,
  ) {}

  @Get('dashboard')
  @ApiOkResponse({ type: DashboardDto })
  dashboard(): Promise<DashboardDto> {
    return this.teamlead.dashboard();
  }

  @Get('board')
  @ApiOperation({ summary: "§10.3 Mitarbeitenden-Board for the day (assigned bundles per employee)" })
  @ApiOkResponse({ type: BoardDto })
  board(@Query('date') date: string): Promise<BoardDto> {
    return this.teamlead.board(date ?? new Date().toISOString().slice(0, 10));
  }

  @Get('capacity')
  @ApiOperation({ summary: '§10.1 Day capacity tile (net / planned / reserve / utilisation)' })
  @ApiOkResponse({ type: CapacityDto })
  capacity(@Query('date') date: string): Promise<CapacityDto> {
    return this.teamlead.capacity(date ?? new Date().toISOString().slice(0, 10));
  }

  @Get('kpis')
  @ApiOperation({ summary: '§10.1 Day ZST KPIs (computed from ZstRecord + case statuses)' })
  @ApiOkResponse({ type: KpiDto })
  kpis(@Query('date') date: string): Promise<KpiDto> {
    return this.teamlead.kpis(date ?? new Date().toISOString().slice(0, 10));
  }

  @Get('events')
  @ApiOperation({ summary: '§7.2/§16.2 audit feed (workflow events, newest first)' })
  @ApiOkResponse({ type: [AuditEventDto] })
  events(@Query() query: EventQueryDto): Promise<AuditEventDto[]> {
    return this.teamlead.auditEvents(query);
  }

  @Get('cases')
  @ApiOperation({ summary: 'List the operational pool (filter + paginate)' })
  @ApiOkResponse({ type: PoolListDto })
  pool(@Query() query: PoolQueryDto): Promise<PoolListDto> {
    return this.teamlead.listPool(query);
  }

  @Post('cases/:caseId/prioritize')
  @ApiOkResponse({ type: TransitionResultDto })
  prioritize(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: PrioritizeDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.prioritize(principal, caseId, dto);
  }

  @Post('cases/:caseId/park')
  @ApiOkResponse({ type: TransitionResultDto })
  park(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: ParkDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.park(principal, caseId, dto);
  }

  @Post('cases/:caseId/unpark')
  @ApiOkResponse({ type: TransitionResultDto })
  unpark(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
  ): Promise<TransitionResultDto> {
    return this.teamlead.unpark(principal, caseId);
  }

  @Post('issues/:issueId/resolve')
  @ApiOperation({ summary: 'Resolve an issue (issue_open → waiting_teamlead, issue.resolved)' })
  @ApiOkResponse({ type: TransitionResultDto })
  resolveIssue(
    @CurrentUser() principal: Principal,
    @Param('issueId') issueId: string,
    @Body() dto: ResolveIssueDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.resolveIssue(principal, issueId, dto);
  }

  @Post('issues/:issueId/release')
  @ApiOperation({ summary: 'Release a case back to work (waiting_teamlead → released → checking)' })
  @ApiOkResponse({ type: TransitionResultDto })
  releaseIssue(
    @CurrentUser() principal: Principal,
    @Param('issueId') issueId: string,
    @Body() dto: ReleaseDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.releaseIssue(principal, issueId, dto);
  }

  // --- Assignment engine (§8.3) ---------------------------------------------

  @Post('assignments/recalculate')
  @ApiOperation({
    summary: 'Recalculate the day assignment (§8.3 "Neu berechnen"). Deterministic, < 5 s.',
  })
  @ApiOkResponse({ type: RecalculateResultDto })
  recalculate(
    @CurrentUser() principal: Principal,
    @Body() dto: RecalculateDto,
  ): Promise<RecalculateResultDto> {
    return this.assignment.recalculate(principal, dto.date);
  }
}
