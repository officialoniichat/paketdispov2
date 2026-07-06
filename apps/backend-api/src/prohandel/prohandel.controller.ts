import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { ClockService } from '../clock/clock.service.js';
import { ProhandelService } from './prohandel.service.js';
import { ProhandelPullResultDto } from './prohandel.dto.js';

/**
 * Mock-ProHandel-Integration (A9). „Jetzt pullen" im Admin-Cockpit ruft diesen
 * Endpunkt; der Connector erzeugt Belege mit allen ERP-Feldern direkt in der DB
 * (kein echter HTTP-Call, deterministisch).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.Admin, Role.Teamlead)
@Controller('api/admin/integrations/prohandel')
export class ProhandelController {
  constructor(
    private readonly prohandel: ProhandelService,
    private readonly clock: ClockService,
  ) {}

  @Post('pull')
  @ApiOperation({
    summary: 'Mock-ProHandel-Pull: erzeugt die nächste Beleg-Charge mit allen ERP-Feldern.',
  })
  @ApiCreatedResponse({ type: ProhandelPullResultDto })
  async pull(@CurrentUser() principal: Principal): Promise<ProhandelPullResultDto> {
    return this.prohandel.pull(principal, await this.clock.now());
  }
}
