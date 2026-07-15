import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { CasesService } from './cases.service.js';
import { CompleteDto, PartialCompleteDto, TransitionResultDto } from './cases.dto.js';

/**
 * Employee package-handling lifecycle (§14.2 Mitarbeiter-App). Every handler is
 * ownership-checked in the service so a worker can only drive their own packages
 * (§16.1).
 */
@ApiTags('cases')
@ApiBearerAuth()
@Roles(Role.Employee)
@Controller('api')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post('cases/:caseId/start-preparation')
  @ApiOperation({
    summary:
      'Begin handling a package (assigned → in_progress, case.started) or resume after Teamlead clearance (problem_resolved → in_progress, case.resumed)',
  })
  @ApiOkResponse({ type: TransitionResultDto })
  startPreparation(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
  ): Promise<TransitionResultDto> {
    return this.cases.startPreparation(principal, caseId);
  }

  @Post('cases/:caseId/complete')
  @ApiOperation({ summary: 'Complete a package (in_progress → completed, case.completed)' })
  @ApiOkResponse({ type: TransitionResultDto })
  complete(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: CompleteDto,
  ): Promise<TransitionResultDto> {
    return this.cases.complete(principal, caseId, dto);
  }

  @Post('cases/:caseId/partial-complete')
  @ApiOperation({
    summary:
      'Teilabschluss mit gesammelten Problemen (in_progress → issue_open, case.problems_reported); der Beleg bleibt beim selben MA geparkt',
  })
  @ApiOkResponse({ type: TransitionResultDto })
  partialComplete(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: PartialCompleteDto,
  ): Promise<TransitionResultDto> {
    return this.cases.partialComplete(principal, caseId, dto);
  }
}
