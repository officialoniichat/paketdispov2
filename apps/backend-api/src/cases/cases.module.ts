import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { AssignmentModule } from '../assignment/assignment.module.js';
import { CasesService } from './cases.service.js';
import { TeamleadService } from './teamlead.service.js';
import { MeController } from './me.controller.js';
import { CasesController } from './cases.controller.js';
import { TeamleadController } from './teamlead.controller.js';

/** Digital receipt pool + case lifecycle (§14.2, §16.1). */
@Module({
  imports: [WorkflowModule, AssignmentModule],
  controllers: [MeController, CasesController, TeamleadController],
  providers: [CasesService, TeamleadService],
})
export class CasesModule {}
