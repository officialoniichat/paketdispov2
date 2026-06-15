import { Module } from '@nestjs/common';
import { AssignmentService } from './assignment.service.js';

/**
 * Assignment engine boundary (§8.3). Prisma + the event log are global, so this
 * module only needs to provide and export the service for the Teamlead controller.
 */
@Module({
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
