import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { EmployeesService } from './employees.service.js';
import {
  AbsenceCreateDto,
  AbsenceDto,
  EmployeeCreateDto,
  EmployeeDetailDto,
  EmployeeListResponseDto,
  EmployeeProfileUpdateDto,
  PinResetDto,
  WorkstationDto,
} from './employees.dto.js';

/**
 * §11 Mitarbeiter-Einstellungen (Arbeitszeit & Einsatzplanung). The single place
 * the worker capacity that feeds the assignment engine (netCapacityMinutes) is
 * viewed and edited. Admin owns master data, Teamlead steers the day — both roles
 * are accepted, matching the rest of the admin surface.
 */
@ApiTags('employees')
@ApiBearerAuth()
@Roles(Role.Admin, Role.Teamlead)
@Controller('api/admin/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'List employees with today’s shift, capacity and absence.' })
  @ApiQuery({ name: 'date', required: false, description: 'ISO date YYYY-MM-DD (default today)' })
  @ApiOkResponse({ type: EmployeeListResponseDto })
  list(@Query('date') date?: string): Promise<EmployeeListResponseDto> {
    return this.employees.list(date);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an employee (temporäre Kraft by default: measured=false, ohne Leistungsmessung).',
  })
  @ApiCreatedResponse({ type: EmployeeDetailDto })
  create(
    @CurrentUser() principal: Principal,
    @Body() body: EmployeeCreateDto,
  ): Promise<EmployeeDetailDto> {
    return this.employees.create(principal, body);
  }

  // NOTE: declared before ':id' so the static path wins over the param route.
  @Get('workstations')
  @ApiOperation({ summary: 'List active workstations (Tische) as Arbeitsplatz options.' })
  @ApiOkResponse({ type: [WorkstationDto] })
  listWorkstations(): Promise<WorkstationDto[]> {
    return this.employees.listWorkstations();
  }

  // NOTE: static 'absences' paths declared before ':id' so they win over the param route.
  @Get('absences')
  @ApiOperation({ summary: 'Krank-/Urlaubs-Spannen im Zeitraum (Schichtplan-Kalender).' })
  @ApiQuery({ name: 'from', required: true, description: 'ISO date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: true, description: 'ISO date YYYY-MM-DD' })
  @ApiOkResponse({ type: [AbsenceDto] })
  listAbsences(@Query('from') from: string, @Query('to') to: string): Promise<AbsenceDto[]> {
    return this.employees.listAbsences(from, to);
  }

  @Post('absences')
  @ApiOperation({ summary: 'Krankschreibung/Urlaub eintragen (Rechtsklick im Kalender).' })
  @ApiCreatedResponse({ type: AbsenceDto })
  createAbsence(@Body() body: AbsenceCreateDto): Promise<AbsenceDto> {
    return this.employees.createAbsence(body);
  }

  @Delete('absences/:absenceId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Abwesenheit löschen (Kalender-Kontextmenü).' })
  @ApiNoContentResponse()
  async deleteAbsence(@Param('absenceId') absenceId: string): Promise<void> {
    await this.employees.deleteAbsence(absenceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Employee detail incl. weekly pattern and recent audit.' })
  @ApiQuery({ name: 'date', required: false, description: 'ISO date YYYY-MM-DD (default today)' })
  @ApiOkResponse({ type: EmployeeDetailDto })
  get(@Param('id') id: string, @Query('date') date?: string): Promise<EmployeeDetailDto> {
    return this.employees.get(id, date);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update profile (active, area tags, productivity, overtime, pattern).' })
  @ApiOkResponse({ type: EmployeeDetailDto })
  updateProfile(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() body: EmployeeProfileUpdateDto,
  ): Promise<EmployeeDetailDto> {
    return this.employees.updateProfile(principal, id, body);
  }

  @Patch(':id/pin')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin-only PIN reset (employeeNo + PIN login, Auth-Task 5).' })
  @ApiNoContentResponse()
  async resetPin(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() body: PinResetDto,
  ): Promise<void> {
    await this.employees.resetPin(principal, id, body.pin);
  }
}
