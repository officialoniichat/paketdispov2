import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { EventsModule } from './events/events.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WorkflowModule } from './workflow/workflow.module.js';
import { LiveModule } from './live/live.module.js';
import { CasesModule } from './cases/cases.module.js';
import { HealthModule } from './health/health.module.js';

/**
 * Backbone of the modular monolith (§12.3). Cross-cutting concerns (Prisma,
 * Events, Auth/RBAC, Live status) are global; feature modules sit on top.
 */
@Module({
  imports: [
    PrismaModule,
    EventsModule,
    AuthModule,
    LiveModule,
    WorkflowModule,
    CasesModule,
    HealthModule,
  ],
})
export class AppModule {}
