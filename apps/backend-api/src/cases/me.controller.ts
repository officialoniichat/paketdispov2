import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { CasesService } from './cases.service.js';
import { CaseAggregateDto, CurrentBundleDto, TodayResponseDto } from './cases.dto.js';

/** Employee self-service (§14.2). Always scoped to the caller's own data (§16.1). */
@ApiTags('me')
@ApiBearerAuth()
@Roles(Role.Employee)
@Controller('api/me')
export class MeController {
  constructor(private readonly cases: CasesService) {}

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
}
