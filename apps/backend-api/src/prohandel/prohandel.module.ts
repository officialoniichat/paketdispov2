import { Module } from '@nestjs/common';
import { ProhandelController } from './prohandel.controller.js';
import { ProhandelService } from './prohandel.service.js';
import { PictogramsController } from './pictograms.controller.js';

/**
 * Mock-ProHandel-Integration (Teamlead-Feedback A4/A9): „Jetzt pullen"-Connector +
 * Sicherungstyp-Piktogramm-Assets. Ersetzt den reinen UI-Mock im Admin-Cockpit.
 */
@Module({
  controllers: [ProhandelController, PictogramsController],
  providers: [ProhandelService],
})
export class ProhandelModule {}
