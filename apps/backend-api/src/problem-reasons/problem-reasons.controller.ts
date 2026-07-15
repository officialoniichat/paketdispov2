import { Body, Controller, Get, ParseArrayPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, Roles } from '../auth/rbac.js';
import { ProblemReasonsService } from './problem-reasons.service.js';
import { ProblemReasonDto, ProblemReasonUpsertDto } from './problem-reasons.dto.js';

/**
 * Problemarten-Katalog (Kundenfeedback 14.07.2026, Punkt 5): Admin/Teamlead
 * pflegen ihn im Cockpit, die Mitarbeiter-App lädt die aktiven Gründe dynamisch.
 */
@ApiTags('problem-reasons')
@ApiBearerAuth()
@Controller('api')
export class ProblemReasonsController {
  constructor(private readonly reasons: ProblemReasonsService) {}

  @Get('problem-reasons')
  @Roles(Role.Employee, Role.Teamlead, Role.Admin)
  @ApiOperation({ summary: 'Aktive Problemarten für die Problem-Erfassung der Mitarbeiter-App.' })
  @ApiOkResponse({ type: [ProblemReasonDto] })
  activeReasons(): Promise<ProblemReasonDto[]> {
    return this.reasons.listActive();
  }

  @Get('admin/problem-reasons')
  @Roles(Role.Admin, Role.Teamlead)
  @ApiOperation({ summary: 'Vollständiger Problemarten-Katalog (inkl. inaktiver) für die Pflege.' })
  @ApiOkResponse({ type: [ProblemReasonDto] })
  allReasons(): Promise<ProblemReasonDto[]> {
    return this.reasons.listAll();
  }

  @Put('admin/problem-reasons')
  @Roles(Role.Admin, Role.Teamlead)
  @ApiOperation({
    summary:
      'Katalog ersetzen: Upsert per id, Neuanlage ohne id; entfernte Gründe werden gelöscht bzw. bei Issue-Referenz nur deaktiviert.',
  })
  @ApiBody({ type: [ProblemReasonUpsertDto] })
  @ApiOkResponse({ type: [ProblemReasonDto] })
  replaceReasons(
    @Body(new ParseArrayPipe({ items: ProblemReasonUpsertDto }))
    body: ProblemReasonUpsertDto[],
  ): Promise<ProblemReasonDto[]> {
    return this.reasons.replaceAll(body);
  }
}
