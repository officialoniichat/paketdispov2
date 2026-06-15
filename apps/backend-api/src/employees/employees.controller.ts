import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { EmployeesService } from './employees.service.js';
import {
  AbsenceCreateDto,
  EmployeeDetailDto,
  EmployeeListResponseDto,
  EmployeeProfileUpdateDto,
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

  @Post(':id/absence')
  @ApiOperation({ summary: 'Record an absence; zeroes/shortens affected shift capacity.' })
  @ApiOkResponse({ type: EmployeeDetailDto })
  createAbsence(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() body: AbsenceCreateDto,
  ): Promise<EmployeeDetailDto> {
    return this.employees.createAbsence(principal, id, body);
  }
}
