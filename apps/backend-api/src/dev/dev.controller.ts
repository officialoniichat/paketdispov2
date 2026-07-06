import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Role, Roles } from '../auth/rbac.js';
import { ClockService } from '../clock/clock.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DevPanelGuard } from './dev-panel.guard.js';
import { ScenarioService } from './scenario.service.js';
import {
  DevScenariosDto,
  MaterializeShiftsDto,
  MaterializeShiftsResultDto,
  ScenarioLoadResultDto,
  TimeOverrideDto,
  TimeOverrideStateDto,
} from './dev.dto.js';

const timeOverrideInputSchema = z.object({ now: z.string().datetime({ offset: true }) });

/**
 * Dev/demo panel API — Szenario-Katalog, Zeit-Override und Quick-Knobs. NOT part
 * of the production surface: {@link DevPanelGuard} answers 404 unless the DEV_PANEL
 * env gate is on (default outside production). Admin-only on top of that gate.
 * The other quick knobs (mock-ProHandel pull, recalculate) already exist as admin/
 * teamlead endpoints and are called directly by the panel.
 */
@ApiTags('dev')
@ApiBearerAuth()
@Roles(Role.Admin)
@UseGuards(DevPanelGuard)
@Controller('api/dev')
export class DevController {
  constructor(
    private readonly scenarios: ScenarioService,
    private readonly clock: ClockService,
    private readonly assignment: AssignmentService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('scenarios')
  @ApiOperation({
    summary: 'DEV-ONLY: scenario catalog + active scenario + time-override state.',
  })
  @ApiOkResponse({ type: DevScenariosDto })
  listScenarios(): Promise<DevScenariosDto> {
    return this.scenarios.state();
  }

  @Post('scenarios/:key/load')
  @ApiOperation({
    summary:
      'DEV-ONLY: reset the case graph and seed the scenario deterministically (idempotent; 404 for an unknown key).',
  })
  @ApiOkResponse({ type: ScenarioLoadResultDto })
  loadScenario(@Param('key') key: string): Promise<ScenarioLoadResultDto> {
    return this.scenarios.load(key);
  }

  @Post('scenarios/reset')
  @ApiOperation({
    summary:
      "DEV-ONLY: 'Zurücksetzen auf Standard' — load the default 'standard' scenario (recorded as the active key).",
  })
  @ApiOkResponse({ type: ScenarioLoadResultDto })
  resetScenario(): Promise<ScenarioLoadResultDto> {
    return this.scenarios.reset();
  }

  // --- Time override ------------------------------------------------------------

  @Post('time-override')
  @ApiOperation({
    summary:
      'DEV-ONLY: freeze the server "now" (persisted; recalculate/pull/dashboard/board dates follow it).',
  })
  @ApiOkResponse({ type: TimeOverrideStateDto })
  async setTimeOverride(@Body() dto: TimeOverrideDto): Promise<TimeOverrideStateDto> {
    const parsed = timeOverrideInputSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException('now muss ein ISO-8601-Zeitstempel sein');
    }
    const now = new Date(parsed.data.now);
    await this.clock.setOverride(now);
    return { timeOverride: now.toISOString() };
  }

  @Delete('time-override')
  @ApiOperation({ summary: 'DEV-ONLY: clear the time override — back to real time.' })
  @ApiOkResponse({ type: TimeOverrideStateDto })
  async clearTimeOverride(): Promise<TimeOverrideStateDto> {
    await this.clock.clearOverride();
    return { timeOverride: null };
  }

  // --- Quick knobs -----------------------------------------------------------------

  @Post('materialize-shifts')
  @ApiOperation({
    summary:
      "DEV-ONLY: materialize every active employee's shift for a date from their weekly pattern.",
  })
  @ApiOkResponse({ type: MaterializeShiftsResultDto })
  async materializeShifts(
    @Body() dto: MaterializeShiftsDto,
  ): Promise<MaterializeShiftsResultDto> {
    const dayStart = new Date(`${dto.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${dto.date}T23:59:59.999Z`);
    await this.assignment.materializeShiftsForDate(dto.date, dayStart);
    const shiftCount = await this.prisma.shift.count({
      where: { date: { gte: dayStart, lte: dayEnd }, active: true },
    });
    return { date: dto.date, shiftCount };
  }
}
