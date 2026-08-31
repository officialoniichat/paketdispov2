import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { CasesService } from './cases.service.js';
import {
  CompleteDto,
  ConfirmPositionDto,
  CountSkuLineDto,
  PartialCompleteDto,
  PositionConfirmResultDto,
  SetCollectedDto,
  SetCollectedResultDto,
  SkuCountResultDto,
  TransitionResultDto,
} from './cases.dto.js';

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

  @Post('cases/:caseId/collected')
  @ApiOperation({
    summary:
      'Ware-holen-Haken (B2): Beleg als „geholt" bzw. wieder „offen" markieren (case.collected). Tipp und Lagerplatz-Scan persistieren über diesen einen Weg.',
  })
  @ApiOkResponse({ type: SetCollectedResultDto })
  setCollected(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: SetCollectedDto,
  ): Promise<SetCollectedResultDto> {
    return this.cases.setCollected(principal, caseId, dto);
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

  @Post('cases/:caseId/positions/:positionId/confirmed')
  @ApiParam({ name: 'caseId', description: 'Goods-receipt case id' })
  @ApiParam({ name: 'positionId', description: 'ReceiptPosition des Belegs' })
  @ApiOperation({
    summary:
      '„Position geprüft" setzen/zurücknehmen (serverseitig persistiert, Konzept beleg-zusammenarbeit §2/§7). Beleg muss in Bearbeitung sein; kein Versions-Inkrement.',
  })
  @ApiOkResponse({ type: PositionConfirmResultDto })
  confirmPosition(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Param('positionId') positionId: string,
    @Body() dto: ConfirmPositionDto,
  ): Promise<PositionConfirmResultDto> {
    return this.cases.confirmPosition(principal, caseId, positionId, dto);
  }

  @Post('cases/:caseId/sku-lines/:skuLineId/count')
  @ApiParam({ name: 'caseId', description: 'Goods-receipt case id' })
  @ApiParam({ name: 'skuLineId', description: 'Größenzeile (ReceiptSkuLine) des Belegs' })
  @ApiOperation({
    summary:
      'Ist-Menge/Preiskorrektur einer Größenzeile erfassen (pro Aktion persistiert, Konzept §7); null setzt den jeweiligen Wert zurück.',
  })
  @ApiOkResponse({ type: SkuCountResultDto })
  countSkuLine(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Param('skuLineId') skuLineId: string,
    @Body() dto: CountSkuLineDto,
  ): Promise<SkuCountResultDto> {
    return this.cases.countSkuLine(principal, caseId, skuLineId, dto);
  }
}
