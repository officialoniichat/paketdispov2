import { Controller, Global, Injectable, Module, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { filter, map, type Observable, Subject } from 'rxjs';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';

export interface LiveStatusEvent {
  caseId: string;
  status: string;
  eventType?: string;
  /** Owner of the case, used to scope the employee stream (§16.1). */
  employeeNo?: string | null;
  at: string;
}

interface SseMessage {
  data: LiveStatusEvent;
  type: string;
}

/**
 * In-process live-status bus (§12.3 SSE/WebSocket). Producers (cases / teamlead
 * services) publish status changes; consumers subscribe via SSE. The employee
 * stream is filtered to the caller's own packages so §16.1 is never violated.
 */
@Global()
@Injectable()
export class LiveStatusService {
  private readonly subject = new Subject<LiveStatusEvent>();

  publish(event: LiveStatusEvent): void {
    this.subject.next(event);
  }

  stream(predicate: (event: LiveStatusEvent) => boolean): Observable<SseMessage> {
    return this.subject.asObservable().pipe(
      filter(predicate),
      map((event) => ({ data: event, type: 'case-status' })),
    );
  }
}

@ApiTags('live')
@ApiBearerAuth()
@Controller('api')
export class LiveController {
  constructor(private readonly live: LiveStatusService) {}

  @Sse('me/stream')
  @Roles(Role.Employee)
  @ApiOperation({ summary: 'SSE live status for the caller’s own packages (§16.1)' })
  meStream(@CurrentUser() principal: Principal): Observable<SseMessage> {
    return this.live.stream((e) => Boolean(e.employeeNo) && e.employeeNo === principal.employeeNo);
  }

  @Sse('teamlead/stream')
  @Roles(Role.Teamlead, Role.Admin)
  @ApiOperation({ summary: 'SSE live status for the full operational pool' })
  teamleadStream(): Observable<SseMessage> {
    return this.live.stream(() => true);
  }
}

@Global()
@Module({
  controllers: [LiveController],
  providers: [LiveStatusService],
  exports: [LiveStatusService],
})
export class LiveModule {}
