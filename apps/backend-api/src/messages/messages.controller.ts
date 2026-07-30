import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';
import { MessagesService } from './messages.service.js';
import {
  MessageReadDto,
  MyMessageListDto,
  SendMessageDto,
  TeamleadMessageDto,
  TeamleadMessageListDto,
} from './messages.dto.js';

/** Teamlead-Seite: Nachricht senden + Lesestatus (Sidebar-Ausklapper). */
@ApiTags('teamlead')
@ApiBearerAuth()
@Roles(Role.Teamlead)
@Controller('api/teamlead/messages')
export class TeamleadMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Nachricht an die Mitarbeiter-App eines Mitarbeiters senden.' })
  @ApiOkResponse({ type: TeamleadMessageDto })
  send(@CurrentUser() principal: Principal, @Body() dto: SendMessageDto): Promise<TeamleadMessageDto> {
    return this.messages.send(principal, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Gesendete Nachrichten (neueste zuerst) inkl. Gelesen-Quittung.' })
  @ApiOkResponse({ type: TeamleadMessageListDto })
  list(): Promise<TeamleadMessageListDto> {
    return this.messages.listSent();
  }
}

/** Mitarbeiter-Seite (PWA): ungelesene Nachrichten + „Gelesen"-Quittung. */
@ApiTags('me')
@ApiBearerAuth()
@Roles(Role.Employee)
@Controller('api/me/messages')
export class MeMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @ApiOkResponse({ type: MyMessageListDto })
  unread(@CurrentUser() principal: Principal): Promise<MyMessageListDto> {
    return this.messages.unreadForMe(principal);
  }

  @Post(':id/read')
  @ApiParam({ name: 'id', description: 'Nachricht-Id' })
  @ApiOperation({ summary: 'Nachricht als gelesen quittieren (nur die eigene).' })
  @ApiOkResponse({ type: MessageReadDto })
  read(@CurrentUser() principal: Principal, @Param('id') id: string): Promise<MessageReadDto> {
    return this.messages.markRead(principal, id);
  }
}
