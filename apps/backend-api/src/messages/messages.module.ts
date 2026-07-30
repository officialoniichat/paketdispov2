import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service.js';
import { MeMessagesController, TeamleadMessagesController } from './messages.controller.js';

/**
 * Teamlead-Nachrichten an die Mitarbeiter-App (Vorverteilungs-Eingriffe):
 * Senden + Lesestatus (Teamlead) und Banner + „Gelesen"-Quittung (PWA).
 */
@Module({
  controllers: [TeamleadMessagesController, MeMessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
