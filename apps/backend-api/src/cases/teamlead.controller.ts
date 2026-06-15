import { Body, Controller, Get, NotImplementedException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { TeamleadService } from './teamlead.service.js';
import {
  DashboardDto,
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
  constructor(private readonly teamlead: TeamleadService) {}

  @Get('dashboard')
  @ApiOkResponse({ type: DashboardDto })
  dashboard(): Promise<DashboardDto> {
    return this.teamlead.dashboard();
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

  // --- Assignment engine endpoints (EPIC 4) ---------------------------------

  @Post('assignments/recalculate')
  @ApiOperation({ summary: 'Recalculate day assignment — EPIC 4 assignment engine' })
  recalculate(): never {
    throw new NotImplementedException('assignment recalculation lands with EPIC 4');
  }

  @Post('assignments/manual')
  @ApiOperation({ summary: 'Manual assignment override — EPIC 4 assignment engine' })
  manualAssign(): never {
    throw new NotImplementedException('manual assignment lands with EPIC 4');
  }
}
