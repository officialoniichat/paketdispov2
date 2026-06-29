import { Body, Controller, Get, ParseArrayPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, Roles } from '../auth/rbac.js';
import { AdminService } from './admin.service.js';
import { LocationDto, LocationUpsertDto, RuleConfigDto } from './admin.dto.js';

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
}
