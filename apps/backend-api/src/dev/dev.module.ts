import { Module } from '@nestjs/common';
import { AssignmentModule } from '../assignment/assignment.module.js';
import { DevController } from './dev.controller.js';
import { DevPanelGuard } from './dev-panel.guard.js';
import { ScenarioService } from './scenario.service.js';

/**
 * Dev/demo tooling: the /api/dev scenario panel, time override and quick knobs.
 * Always registered so the OpenAPI spec documents the surface; at runtime the
 * whole controller is env-gated by {@link DevPanelGuard} (404 when disabled).
 */
@Module({
  imports: [AssignmentModule],
  controllers: [DevController],
  providers: [ScenarioService, DevPanelGuard],
})
export class DevModule {}
