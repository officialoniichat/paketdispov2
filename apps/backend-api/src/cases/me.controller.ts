import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { ClockService } from '../clock/clock.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { NextBundleResultDto } from '../assignment/assignment.dto.js';
import { CasesService } from './cases.service.js';
import {
  CaseAggregateDto,
  ClaimWorkstationDto,
  CurrentBundleDto,
  MeWorkstationDto,
  ParkRemainingDto,
  ParkRemainingResultDto,
  TodayResponseDto,
} from './cases.dto.js';

/** Employee self-service (§14.2). Always scoped to the caller's own data (§16.1). */
@ApiTags('me')
@ApiBearerAuth()
@Roles(Role.Employee)
@Controller('api/me')
export class MeController {
  constructor(
    private readonly cases: CasesService,
    private readonly assignment: AssignmentService,
    private readonly clock: ClockService,
  ) {}

  @Get('today')
  @ApiOkResponse({ type: TodayResponseDto })
  today(@CurrentUser() principal: Principal): Promise<TodayResponseDto> {
    return this.cases.getToday(principal);
  }

  @Get('current-bundle')
  @ApiOkResponse({ type: CurrentBundleDto, description: 'Active bundle, or null if none' })
  currentBundle(@CurrentUser() principal: Principal): Promise<CurrentBundleDto | null> {
    return this.cases.getCurrentBundle(principal);
  }

  /** §14.2 full case aggregate (header + positions + box targets) for the PWA. */
  @Get('cases/:caseId/aggregate')
  @ApiParam({ name: 'caseId', description: 'Goods-receipt case id' })
  @ApiOkResponse({ type: CaseAggregateDto })
  caseAggregate(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
  ): Promise<CaseAggregateDto> {
    return this.cases.getCaseAggregate(principal, caseId);
  }

  /**
   * §continuation (Pull-on-idle): the worker requests the next cart-sized bundle.
   * Returns `{ assigned:true }` after binding a new bundle, or a `reason` why not.
   */
  @Post('next-bundle')
  @ApiOkResponse({ type: NextBundleResultDto })
  async nextBundle(@CurrentUser() principal: Principal): Promise<NextBundleResultDto> {
    return this.assignment.assignNextBundle(principal, undefined, await this.clock.now());
  }

  /** A2 Tisch-Anmeldung: eigenen Arbeitsplatz per Tisch-Nr. oder Barcode claimen. */
  @Post('workstation')
  @ApiOkResponse({ type: MeWorkstationDto })
  claimWorkstation(
    @CurrentUser() principal: Principal,
    @Body() dto: ClaimWorkstationDto,
  ): Promise<MeWorkstationDto> {
    return this.cases.claimWorkstation(principal, dto);
  }

  /**
   * B4 Parkposition („Rest parken"): restliche, unbegonnene Belege des eigenen
   * Bündels zurück in den Pool — sie werden ins nächste Bündel eingeplant.
   */
  @Post('park')
  @ApiOkResponse({ type: ParkRemainingResultDto })
  parkRemaining(
    @CurrentUser() principal: Principal,
    @Body() dto: ParkRemainingDto,
  ): Promise<ParkRemainingResultDto> {
    return this.cases.parkRemaining(principal, dto);
  }
}
