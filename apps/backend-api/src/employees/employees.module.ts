import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service.js';
import { EmployeesController } from './employees.controller.js';

/**
 * §11 Mitarbeiter-Einstellungen. PrismaService + EventLogService are global, so the
 * module only wires its own controller/service. Capacity writes land on the same
 * Shift fields the assignment engine reads.
 */
@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
