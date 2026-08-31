import { Controller, Global, Injectable, Module, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LiveEvent, LiveEventType } from '@paket/domain-types';
import { filter, map, type Observable, Subject } from 'rxjs';
import { CurrentUser, Role, Roles, type Principal } from '../auth/rbac.js';

/**
 * SSE-Rahmen: der `event`-Name ist der Ereignistyp, die Clients registrieren
 * `addEventListener` je Typ aus `liveEventTypeSchema.options`.
 */
export interface SseMessage {
  data: LiveEvent;
  type: LiveEventType;
}

/**
 * In-process Live-Bus (§12.3 SSE). Produzenten (Cases/Teamlead/Zusammenarbeit)
 * veröffentlichen typisierte {@link LiveEvent}s, die an MEHRERE Empfänger adressiert
 * sind (`recipients` = employeeNos: Inhaber + aktive Beteiligte, bei Einladungen der
 * Eingeladene; leer = nur der Teamlead-Stream). Der Mitarbeiter-Stream filtert auf die
 * eigene Personalnummer, damit §16.1 (nur eigene Belege) auch bei geteilten Belegen
 * gilt — der Empfängerkreis ist die einzige Sichtbarkeitsentscheidung, die Clients
 * bekommen nie fremde Ereignisse zu sehen.
 */
@Global()
@Injectable()
export class LiveStatusService {
  private readonly subject = new Subject<LiveEvent>();

  publish(event: LiveEvent): void {
    this.subject.next(event);
  }

  stream(predicate: (event: LiveEvent) => boolean): Observable<SseMessage> {
    return this.subject.asObservable().pipe(
      filter(predicate),
      map((event) => ({ data: event, type: event.type })),
    );
  }
}

/** Sichtbarkeit im Mitarbeiter-Stream: nur Ereignisse, die mich adressieren (§16.1). */
export function isAddressedTo(event: LiveEvent, employeeNo: string | undefined): boolean {
  return employeeNo != null && event.recipients.includes(employeeNo);
}

@ApiTags('live')
@ApiBearerAuth()
@Controller('api')
export class LiveController {
  constructor(private readonly live: LiveStatusService) {}

  @Sse('me/stream')
  @Roles(Role.Employee)
  @ApiOperation({
    summary: 'SSE-Live-Ereignisse, die den Aufrufer adressieren (eigene + geteilte Belege, §16.1)',
  })
  meStream(@CurrentUser() principal: Principal): Observable<SseMessage> {
    return this.live.stream((e) => isAddressedTo(e, principal.employeeNo));
  }

  @Sse('teamlead/stream')
  @Roles(Role.Teamlead, Role.Admin)
  @ApiOperation({ summary: 'SSE-Live-Ereignisse des gesamten operativen Pools' })
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
