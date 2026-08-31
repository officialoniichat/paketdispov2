import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { CollaborationService } from './collaboration.service.js';
import {
  CollaborationController,
  TeamleadCollaborationController,
} from './collaboration.controller.js';

/**
 * Geteilter Beleg — Beteiligung als Overlay (Konzept beleg-zusammenarbeit §2).
 * Mitarbeiter: einladen, antworten, Posteingang „Nachrichten", „Teilbeleg
 * erledigt"; Teamlead: gemeinsam zuweisen + Helfer entfernen (Fachlogik im
 * TeamleadService aus dem CasesModule, weil dort die §8.4-Bündel-Mechanik und
 * das Auflösen beim Entziehen leben). Prisma/Events/Live/Clock sind global.
 */
@Module({
  imports: [CasesModule],
  controllers: [CollaborationController, TeamleadCollaborationController],
  providers: [CollaborationService],
})
export class CollaborationModule {}
