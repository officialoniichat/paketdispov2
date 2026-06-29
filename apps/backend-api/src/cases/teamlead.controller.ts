import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { RecalculateDto, RecalculateResultDto } from '../assignment/assignment.dto.js';
import { TeamleadService } from './teamlead.service.js';
import { TeamleadReadService } from './teamlead-read.service.js';
import {
  AddToBundleDto,
  AuditEventDto,
  BoardDto,
  BundleMutationResultDto,
  BundlePauseDto,
  CancelDto,
  CapacityDto,
  CaseDetailDto,
  DashboardDto,
  EventQueryDto,
  KpiDto,
  ParkDto,
  PoolListDto,
  PoolQueryDto,
  PrioritizeDto,
  ReorderBundleDto,
  ResolveIssueDto,
  TransitionResultDto,
  WithdrawDto,
  ZstExportResultDto,
} from './cases.dto.js';

/** Teamlead pool steering & issue resolution (§14.2). Full operational visibility. */
@ApiTags('teamlead')
@ApiBearerAuth()
@Roles(Role.Teamlead, Role.Admin)
@Controller('api/teamlead')
export class TeamleadController {
  constructor(
    private readonly teamlead: TeamleadService,
    private readonly read: TeamleadReadService,
    private readonly assignment: AssignmentService,
  ) {}

  @Get('dashboard')
  @ApiOkResponse({ type: DashboardDto })
  dashboard(): Promise<DashboardDto> {
    return this.read.dashboard();
  }

  @Get('board')
  @ApiOperation({ summary: "§10.3 Mitarbeitenden-Board for the day (assigned bundles per employee)" })
  @ApiOkResponse({ type: BoardDto })
  board(@Query('date') date: string): Promise<BoardDto> {
    return this.read.board(date ?? new Date().toISOString().slice(0, 10));
  }

  @Get('capacity')
  @ApiOperation({ summary: '§10.1 Day capacity tile (net / planned / free / utilisation)' })
  @ApiOkResponse({ type: CapacityDto })
  capacity(@Query('date') date: string): Promise<CapacityDto> {
    return this.read.capacity(date ?? new Date().toISOString().slice(0, 10));
  }

  @Get('kpis')
  @ApiOperation({ summary: '§10.1 Day ZST KPIs (computed from ZstRecord + case statuses)' })
  @ApiOkResponse({ type: KpiDto })
  kpis(@Query('date') date: string): Promise<KpiDto> {
    return this.read.kpis(date ?? new Date().toISOString().slice(0, 10));
  }

  @Get('events')
  @ApiOperation({ summary: '§7.2/§16.2 audit feed (workflow events, newest first)' })
  @ApiOkResponse({ type: [AuditEventDto] })
  events(@Query() query: EventQueryDto): Promise<AuditEventDto[]> {
    return this.read.auditEvents(query);
  }

  @Get('cases')
  @ApiOperation({ summary: 'List the operational pool (filter + paginate)' })
  @ApiOkResponse({ type: PoolListDto })
  pool(@Query() query: PoolQueryDto): Promise<PoolListDto> {
    return this.read.listPool(query);
  }

  @Get('cases/:caseId')
  @ApiOperation({ summary: '§10.4 Belegdetails: one case with positions, boxes, documents, history' })
  @ApiOkResponse({ type: CaseDetailDto })
  caseDetail(@Param('caseId') caseId: string): Promise<CaseDetailDto> {
    return this.read.caseDetail(caseId);
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

  @Post('cases/:caseId/approve')
  @ApiOperation({ summary: 'Zur Planung freigeben: approve a reviewed case (needs_review → ready).' })
  @ApiOkResponse({ type: TransitionResultDto })
  approve(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: ParkDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.approve(principal, caseId, dto);
  }

  @Post('cases/:caseId/reactivate')
  @ApiOperation({ summary: 'Rest reaktivieren: put a part-finished remainder back to work (partially_completed → ready).' })
  @ApiOkResponse({ type: TransitionResultDto })
  reactivate(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: ParkDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.reactivate(principal, caseId, dto);
  }

  @Post('cases/:caseId/deprioritize')
  @ApiOperation({ summary: 'Priorität entfernen: drop the manual teamlead priority (case.deprioritized).' })
  @ApiOkResponse({ type: TransitionResultDto })
  deprioritize(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: PrioritizeDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.deprioritize(principal, caseId, dto);
  }

  @Post('cases/:caseId/cancel')
  @ApiOperation({ summary: 'Storno: cancel a case (→ cancelled, case.cancelled). Reasoned + audited.' })
  @ApiOkResponse({ type: TransitionResultDto })
  cancel(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: CancelDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.cancel(principal, caseId, dto);
  }

  @Post('cases/:caseId/resolve-issue')
  @ApiOperation({ summary: 'Problem freigeben: resolve a case open issue (issue_open -> in_progress)' })
  @ApiOkResponse({ type: TransitionResultDto })
  resolveIssue(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: ResolveIssueDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.resolveIssue(principal, caseId, dto);
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

  @Post('assignments/preview')
  @ApiOperation({
    summary:
      '§E.4 Simulation/Vorschau: run the engine over the ready pool WITHOUT persisting (no bundles, no events).',
  })
  @ApiOkResponse({ type: RecalculateResultDto })
  preview(
    @CurrentUser() principal: Principal,
    @Body() dto: RecalculateDto,
  ): Promise<RecalculateResultDto> {
    return this.assignment.preview(principal, dto.date);
  }

  @Post('assignments/export-zst')
  @ApiOperation({
    summary:
      'Tagesabschluss (§15.1): export all completed cases (→ zst_done, zst.exported) as a ZST CSV.',
  })
  @ApiOkResponse({ type: ZstExportResultDto })
  exportZst(@CurrentUser() principal: Principal): Promise<ZstExportResultDto> {
    return this.teamlead.exportZst(principal);
  }

  // --- §8.4 manual bundle overrides -----------------------------------------

  @Post('bundles/:bundleId/withdraw')
  @ApiOperation({
    summary: '§8.4 Withdraw a case from a bundle → case back to ready (409 if already started).',
  })
  @ApiOkResponse({ type: BundleMutationResultDto })
  withdraw(
    @CurrentUser() principal: Principal,
    @Param('bundleId') bundleId: string,
    @Body() dto: WithdrawDto,
  ): Promise<BundleMutationResultDto> {
    return this.teamlead.withdraw(principal, bundleId, dto);
  }

  @Post('bundles/:bundleId/add')
  @ApiOperation({ summary: '§8.4 Add a ready case to a bundle → case assigned.' })
  @ApiOkResponse({ type: BundleMutationResultDto })
  addToBundle(
    @CurrentUser() principal: Principal,
    @Param('bundleId') bundleId: string,
    @Body() dto: AddToBundleDto,
  ): Promise<BundleMutationResultDto> {
    return this.teamlead.addToBundle(principal, bundleId, dto);
  }

  @Post('bundles/:bundleId/reorder')
  @ApiOperation({ summary: "§8.4 Reorder a bundle's cases (and its route stops follow)." })
  @ApiOkResponse({ type: BundleMutationResultDto })
  reorder(
    @CurrentUser() principal: Principal,
    @Param('bundleId') bundleId: string,
    @Body() dto: ReorderBundleDto,
  ): Promise<BundleMutationResultDto> {
    return this.teamlead.reorder(principal, bundleId, dto);
  }

  @Post('bundles/:bundleId/pause')
  @ApiOperation({ summary: '§8.4 Pause a bundle (→ paused).' })
  @ApiOkResponse({ type: BundleMutationResultDto })
  pauseBundle(
    @CurrentUser() principal: Principal,
    @Param('bundleId') bundleId: string,
    @Body() dto: BundlePauseDto,
  ): Promise<BundleMutationResultDto> {
    return this.teamlead.pauseBundle(principal, bundleId, dto);
  }

  @Post('bundles/:bundleId/resume')
  @ApiOperation({ summary: '§8.4 Resume a paused bundle (→ active).' })
  @ApiOkResponse({ type: BundleMutationResultDto })
  resumeBundle(
    @CurrentUser() principal: Principal,
    @Param('bundleId') bundleId: string,
    @Body() dto: BundlePauseDto,
  ): Promise<BundleMutationResultDto> {
    return this.teamlead.resumeBundle(principal, bundleId, dto);
  }
}
