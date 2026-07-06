import { Body, Controller, Get, ParseArrayPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, Roles } from '../auth/rbac.js';
import { AdminService } from './admin.service.js';
import {
  InspectionLevelDto,
  LocationDto,
  LocationUpsertDto,
  OnlineSizePreferenceDto,
  OnlineSizePreferenceUploadDto,
  OnlineSizePreferenceUploadResultDto,
  RuleConfigDto,
  WgrCatalogEntryDto,
} from './admin.dto.js';

/**
 * §11 Admin / Regelpflege. Location master + the structured rule config. Teamlead
 * may view/edit config in this pilot (Role.Admin owns master data, Role.Teamlead is
 * granted alongside per the cockpit's operational needs); both roles are accepted.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.Admin, Role.Teamlead)
@Controller('api/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('locations')
  @ApiOperation({ summary: '§11.2 List the location master (Lagerplätze).' })
  @ApiOkResponse({ type: [LocationDto] })
  locations(): Promise<LocationDto[]> {
    return this.admin.listLocations();
  }

  @Put('locations')
  @ApiOperation({
    summary:
      '§11.2 Replace the location master: upsert by code, soft-deactivate omitted rows, 409 if a referenced location is removed.',
  })
  @ApiBody({ type: [LocationUpsertDto] })
  @ApiOkResponse({ type: [LocationDto] })
  replaceLocations(
    @Body(new ParseArrayPipe({ items: LocationUpsertDto })) body: LocationUpsertDto[],
  ): Promise<LocationDto[]> {
    return this.admin.replaceLocations(body);
  }

  @Get('rules')
  @ApiOperation({ summary: '§11 Read the structured rule config (priority/bundle/effort).' })
  @ApiOkResponse({ type: RuleConfigDto })
  rules(): Promise<RuleConfigDto> {
    return this.admin.getRuleConfig();
  }

  @Put('rules')
  @ApiOperation({ summary: '§11 Persist the structured rule config (Zod-validated).' })
  @ApiOkResponse({ type: RuleConfigDto })
  replaceRules(@Body() body: RuleConfigDto): Promise<RuleConfigDto> {
    return this.admin.replaceRuleConfig(body);
  }

  // --- Mock-ERP catalogs (Teamlead-Feedback A2/A5/A8) -------------------------

  @Get('catalogs/wgr')
  @ApiOperation({ summary: 'A2 WGR-Katalog: Warengruppen mit Klartext (z. B. 218110 D-Bermuda).' })
  @ApiOkResponse({ type: [WgrCatalogEntryDto] })
  wgrCatalog(): Promise<WgrCatalogEntryDto[]> {
    return this.admin.listWgrCatalog();
  }

  @Get('catalogs/inspection-levels')
  @ApiOperation({
    summary: 'A5 Prüfstufen-Katalog: Nein/10 %/20 %/Voll mit erklärendem Aufgabentext.',
  })
  @ApiOkResponse({ type: [InspectionLevelDto] })
  inspectionLevels(): Promise<InspectionLevelDto[]> {
    return this.admin.listInspectionLevels();
  }

  @Get('online-size-preferences')
  @ApiOperation({ summary: 'A8 Online-Größen-Präferenzen (Rot/Grün-Hervorhebung der PWA).' })
  @ApiOkResponse({ type: [OnlineSizePreferenceDto] })
  onlineSizePreferences(): Promise<OnlineSizePreferenceDto[]> {
    return this.admin.listOnlineSizePreferences();
  }

  @Post('online-size-preferences/upload')
  @ApiOperation({
    summary:
      'A8 CSV-Upload der Online-Größen-Präferenzen (wgr;sizeVariant;preferredSize;alternativeSize).',
  })
  @ApiOkResponse({ type: OnlineSizePreferenceUploadResultDto })
  uploadOnlineSizePreferences(
    @Body() body: OnlineSizePreferenceUploadDto,
  ): Promise<OnlineSizePreferenceUploadResultDto> {
    return this.admin.uploadOnlineSizePreferences(body.csv);
  }
}
