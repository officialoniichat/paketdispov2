import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service.js';

/** Transactional case state machine + audit integration (§7). */
@Module({
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
