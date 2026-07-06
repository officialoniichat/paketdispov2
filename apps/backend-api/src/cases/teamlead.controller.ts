import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { ClockService } from '../clock/clock.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { RecalculateDto, RecalculateResultDto } from '../assignment/assignment.dto.js';
import { TeamleadService } from './teamlead.service.js';
import { TeamleadReadService } from './teamlead-read.service.js';
import {
  AddToBundleDto,
  AssignBundleDto,
  AssignToEmployeeDto,
  AuditEventDto,
  BoardDto,
  BundleMutationResultDto,
  BundlePauseDto,
  CancelDto,
  CapacityDto,
  CaseDetailDto,
  CaseLookupQueryDto,
  CaseLookupResultDto,
  DashboardDto,
  DeliveryGroupEditDto,
  DeliveryGroupEditResultDto,
  EventQueryDto,
  KpiDto,
  MoveCaseDto,
  ParkDto,
  PoolListDto,
  PoolQueryDto,
  PrioritizeDto,
  ReorderBundleDto,
  ResolveIssueDto,
  TransitionResultDto,
  WithdrawDto,
  ZstExportResultDto,
  CompleteIntakeDto,
  DeliveryGroupReleaseDto,
  DeliveryGroupReleaseResultDto,
  FlagAttentionDto,
  ForwardCaseDto,
  ReturnToBucherDto,
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
    private readonly clock: ClockService,
  ) {}

  /** The effective "today" (YYYY-MM-DD) — honors the dev panel's time override. */
  private async today(): Promise<string> {
    return (await this.clock.now()).toISOString().slice(0, 10);
  }

  @Get('dashboard')
  @ApiOkResponse({ type: DashboardDto })
  async dashboard(): Promise<DashboardDto> {
    return this.read.dashboard(await this.clock.now());
  }

  @Get('board')
  @ApiOperation({ summary: "§10.3 Mitarbeitenden-Board for the day (assigned bundles per employee)" })
  @ApiOkResponse({ type: BoardDto })
  async board(@Query('date') date: string): Promise<BoardDto> {
    return this.read.board(date ?? (await this.today()));
  }

  @Get('capacity')
  @ApiOperation({ summary: '§10.1 Day capacity tile (net / planned / free / utilisation)' })
  @ApiOkResponse({ type: CapacityDto })
  async capacity(@Query('date') date: string): Promise<CapacityDto> {
    return this.read.capacity(date ?? (await this.today()));
  }

  @Get('kpis')
  @ApiOperation({ summary: '§10.1 Day ZST KPIs (computed from ZstRecord + case statuses)' })
  @ApiOkResponse({ type: KpiDto })
  async kpis(@Query('date') date: string): Promise<KpiDto> {
    return this.read.kpis(date ?? (await this.today()));
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

  @Get('cases/lookup')
  @ApiOperation({
    summary:
      'B1 WE-Nr-Zuweisung: look a Beleg up by WE-Belegnummer with an assignability verdict',
  })
  @ApiOkResponse({ type: CaseLookupResultDto })
  lookupCase(@Query() query: CaseLookupQueryDto): Promise<CaseLookupResultDto> {
    return this.read.lookupCase(query.weBelegNo);
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

  @Post('delivery-groups/merge')
  @ApiOperation({ summary: 'Teamlead-Punkt 1: merge/confirm Belege into one locked Lieferung' })
  @ApiOkResponse({ type: DeliveryGroupEditResultDto })
  mergeDeliveryGroup(
    @CurrentUser() principal: Principal,
    @Body() dto: DeliveryGroupEditDto,
  ): Promise<DeliveryGroupEditResultDto> {
    return this.teamlead.mergeDeliveryGroup(principal, dto);
  }

  @Post('delivery-groups/release')
  @ApiOperation({
    summary:
      'D2 „trotzdem bearbeiten": unvollständige Lieferung explizit freigeben (Pool-Hold aufheben)',
  })
  @ApiOkResponse({ type: DeliveryGroupReleaseResultDto })
  releaseDeliveryGroup(
    @CurrentUser() principal: Principal,
    @Body() dto: DeliveryGroupReleaseDto,
  ): Promise<DeliveryGroupReleaseResultDto> {
    return this.teamlead.releaseDeliveryGroup(principal, dto);
  }

  @Post('cases/:caseId/return-to-bucher')
  @ApiOperation({
    summary: 'D1 „Zurück an Bucher": blockierten Beleg an den Bucher melden (mock Queue)',
  })
  @ApiOkResponse({ type: TransitionResultDto })
  returnToBucher(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: ReturnToBucherDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.returnToBucher(principal, caseId, dto);
  }

  @Post('cases/:caseId/complete-intake')
  @ApiOperation({
    summary: 'D1 Freigabe: fehlende Pflichtfelder nachtragen; vollständig → blocked → ready',
  })
  @ApiOkResponse({ type: TransitionResultDto })
  completeIntake(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: CompleteIntakeDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.completeIntake(principal, caseId, dto);
  }

  @Post('cases/:caseId/flag-attention')
  @ApiOperation({
    summary:
      'A7 TL-Topf: Beleg für „Besondere Aufmerksamkeit" markieren (Bucherinnen-Inlet, mock)',
  })
  @ApiOkResponse({ type: TransitionResultDto })
  flagAttention(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: FlagAttentionDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.flagAttention(principal, caseId, dto);
  }

  @Post('cases/:caseId/unflag-attention')
  @ApiOperation({ summary: 'A7 TL-Topf: Aufmerksamkeitsflag entfernen („aus Topf entlassen")' })
  @ApiOkResponse({ type: TransitionResultDto })
  unflagAttention(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
  ): Promise<TransitionResultDto> {
    return this.teamlead.unflagAttention(principal, caseId);
  }

  @Post('cases/:caseId/forward')
  @ApiOperation({
    summary:
      'C5 Digitale Ablage: Beleg „Weiterleiten an …" (Retourenabteilung/Lieferscheinbucher, status-neutral)',
  })
  @ApiOkResponse({ type: TransitionResultDto })
  forward(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: ForwardCaseDto,
  ): Promise<TransitionResultDto> {
    return this.teamlead.forward(principal, caseId, dto);
  }

  @Post('cases/:caseId/unforward')
  @ApiOperation({ summary: 'C5 Digitale Ablage: Weiterleitung „Zurückholen" (Flag löschen)' })
  @ApiOkResponse({ type: TransitionResultDto })
  unforward(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
  ): Promise<TransitionResultDto> {
    return this.teamlead.unforward(principal, caseId);
  }

  @Post('delivery-groups/split')
  @ApiOperation({ summary: 'Teamlead-Punkt 1: split/remove Belege out of a Lieferung (each solo)' })
  @ApiOkResponse({ type: DeliveryGroupEditResultDto })
  splitDeliveryGroup(
    @CurrentUser() principal: Principal,
    @Body() dto: DeliveryGroupEditDto,
  ): Promise<DeliveryGroupEditResultDto> {
    return this.teamlead.splitDeliveryGroup(principal, dto);
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
  async recalculate(
    @CurrentUser() principal: Principal,
    @Body() dto: RecalculateDto,
  ): Promise<RecalculateResultDto> {
    return this.assignment.recalculate(principal, dto.date, await this.clock.now());
  }

  @Post('assignments/preview')
  @ApiOperation({
    summary:
      '§E.4 Simulation/Vorschau: run the engine over the ready pool WITHOUT persisting (no bundles, no events).',
  })
  @ApiOkResponse({ type: RecalculateResultDto })
  async preview(
    @CurrentUser() principal: Principal,
    @Body() dto: RecalculateDto,
  ): Promise<RecalculateResultDto> {
    return this.assignment.preview(principal, dto.date, await this.clock.now());
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

  @Post('employees/:employeeNo/assign')
  @ApiOperation({
    summary:
      '§8.4 Manuelle Zuweisung: assign a ready Beleg to an employee — appended to the day Bündel, or it is CREATED when the employee is free.',
  })
  @ApiOkResponse({ type: BundleMutationResultDto })
  async assignToEmployee(
    @CurrentUser() principal: Principal,
    @Param('employeeNo') employeeNo: string,
    @Body() dto: AssignToEmployeeDto,
  ): Promise<BundleMutationResultDto> {
    return this.teamlead.assignToEmployee(principal, employeeNo, dto, await this.clock.now());
  }

  @Post('employees/:employeeNo/assign-bundle')
  @ApiOperation({
    summary:
      'A1/A2 „Bündel anlegen": assign SEVERAL ready Belege to an employee in one atomic call — appended to the day Bündel, or it is CREATED when the employee is free. All-or-nothing (409 if any Beleg fails validation).',
  })
  @ApiOkResponse({ type: BundleMutationResultDto })
  assignBundleToEmployee(
    @CurrentUser() principal: Principal,
    @Param('employeeNo') employeeNo: string,
    @Body() dto: AssignBundleDto,
  ): Promise<BundleMutationResultDto> {
    return this.teamlead.assignBundleToEmployee(principal, employeeNo, dto);
  }

  @Post('bundles/:bundleId/cases/:caseId/move')
  @ApiOperation({
    summary:
      'B2 „Beleg verschieben": move one assigned case from this bundle straight into another employee\'s Bündel (find-or-create target).',
  })
  @ApiOkResponse({ type: BundleMutationResultDto })
  moveCase(
    @CurrentUser() principal: Principal,
    @Param('bundleId') bundleId: string,
    @Param('caseId') caseId: string,
    @Body() dto: MoveCaseDto,
  ): Promise<BundleMutationResultDto> {
    return this.teamlead.moveCase(principal, bundleId, caseId, dto);
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
