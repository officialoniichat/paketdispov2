import { Global, Module } from '@nestjs/common';
import { EventLogService } from './event-log.service.js';

/** Global so any module can append to the audit event log (§7.2). */
@Global()
@Module({
  providers: [EventLogService],
  exports: [EventLogService],
})
export class EventsModule {}
