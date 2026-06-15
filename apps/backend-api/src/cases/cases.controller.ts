import { Body, Controller, NotImplementedException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { CasesService } from './cases.service.js';
import { CreateIssueDto, PartialCompleteDto, TransitionResultDto } from './cases.dto.js';

/**
 * Employee package-handling lifecycle (§14.2 Mitarbeiter-App). Every handler is
 * ownership-checked in the service so a worker can only drive their own packages
 * (§16.1). Endpoints owned by later EPICs are declared here (so the OpenAPI
 * contract is complete) but return 501 until those EPICs land.
 */
@ApiTags('cases')
@ApiBearerAuth()
@Roles(Role.Employee)
@Controller('api')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post('cases/:caseId/start-preparation')
  @ApiOperation({ summary: 'Begin handling a package (assigned → picking, case.started)' })
  @ApiOkResponse({ type: TransitionResultDto })
  startPreparation(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
  ): Promise<TransitionResultDto> {
    return this.cases.startPreparation(principal, caseId);
  }

  @Post('cases/:caseId/complete')
  @ApiOperation({ summary: 'Complete a package (boxing → completed, case.completed)' })
  @ApiOkResponse({ type: TransitionResultDto })
  complete(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
  ): Promise<TransitionResultDto> {
    return this.cases.complete(principal, caseId);
  }

  @Post('cases/:caseId/partial-complete')
  @ApiOperation({ summary: 'Partially complete (boxing → partially_completed)' })
  @ApiOkResponse({ type: TransitionResultDto })
  partialComplete(
    @CurrentUser() principal: Principal,
    @Param('caseId') caseId: string,
    @Body() dto: PartialCompleteDto,
  ): Promise<TransitionResultDto> {
    return this.cases.partialComplete(principal, caseId, dto);
  }

  @Post('issues')
  @ApiOperation({ summary: 'Report a problem on an owned case (→ issue_open, issue.created)' })
  @ApiOkResponse({ type: TransitionResultDto })
  reportIssue(
    @CurrentUser() principal: Principal,
    @Body() dto: CreateIssueDto,
  ): Promise<TransitionResultDto> {
    return this.cases.reportIssue(principal, dto.caseId, dto);
  }

  // --- Declared for the OpenAPI contract; implemented by EPIC 4/5 -----------

  @Post('cases/:caseId/preparation-complete')
  @ApiOperation({ summary: 'Finish preparation (picking → checking) — EPIC 5' })
  preparationComplete(): never {
    throw new NotImplementedException('preparation-complete lands with EPIC 5 work-completion');
  }

  @Post('positions/:positionId/confirm')
  @ApiOperation({ summary: 'Confirm a position (position.confirmed) — EPIC 5' })
  confirmPosition(): never {
    throw new NotImplementedException('position confirmation lands with EPIC 5');
  }

  @Post('sku-lines/:skuLineId/confirm-quantity')
  @ApiOperation({ summary: 'Confirm a SKU quantity (sku.quantity_confirmed) — EPIC 5' })
  confirmQuantity(): never {
    throw new NotImplementedException('SKU quantity confirmation lands with EPIC 5');
  }

  @Post('bundles/:bundleId/start')
  @ApiOperation({ summary: 'Start a bundle (bundle.started) — EPIC 4' })
  startBundle(): never {
    throw new NotImplementedException('bundle start lands with EPIC 4 assignment engine');
  }

  @Post('route-stops/:stopId/scan')
  @ApiOperation({ summary: 'Scan a pickup location (pickup.location_scanned) — EPIC 4' })
  scanStop(): never {
    throw new NotImplementedException('route-stop scanning lands with EPIC 4');
  }

  @Post('transport-boxes/:boxId/print-label')
  @ApiOperation({ summary: 'Print a box label (box.label_printed) — EPIC 5' })
  printLabel(): never {
    throw new NotImplementedException('box label printing lands with EPIC 5/print module');
  }

  @Post('transport-boxes/:boxId/seal')
  @ApiOperation({ summary: 'Seal a transport box (box.sealed) — EPIC 5' })
  sealBox(): never {
    throw new NotImplementedException('box sealing lands with EPIC 5');
  }
}
