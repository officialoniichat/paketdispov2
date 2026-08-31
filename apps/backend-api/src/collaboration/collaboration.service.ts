import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { LiveStatusService } from '../live/live.module.js';
import { ClockService } from '../clock/clock.service.js';
import type { Principal } from '../auth/rbac.js';
import type { CaseCollaborationDto } from '../cases/cases.dto.js';
import {
  ACTIVE_PARTICIPANT_STATUSES,
  loadCollaborationDto,
  recipientsForCase,
} from './participants.js';
import type {
  ColleagueDto,
  InviteParticipantsDto,
  NachrichtDto,
  NachrichtStatus,
  ParticipantStatusResultDto,
  PosteingangDto,
  RespondInvitationDto,
} from './collaboration.dto.js';

/** Beleg-Status, in denen eingeladen werden darf (Konzept §7). */
const INVITABLE_CASE_STATUSES = ['assigned', 'in_progress', 'problem_resolved'] as const;
/**
 * Beleg-Status, in denen eine Einladung noch ANGENOMMEN werden darf: wie
 * einladbar, plus issue_open (Klärung beim Teamlead pausiert nur die Arbeit).
 * Alles andere — fertig, storniert, aufgeteilt, zurück im Pool — lässt die
 * Einladung verfallen, statt eine Beteiligung an einem Beleg zu erzeugen, der
 * längst nicht mehr so bearbeitet wird.
 */
const ACCEPTABLE_CASE_STATUSES = [...INVITABLE_CASE_STATUSES, 'issue_open'] as const;
/** Fertige Belege — dort ist keine Beteiligungs-Aktion mehr sinnvoll. */
const TERMINAL_CASE_STATUSES = ['completed', 'zst_done', 'cancelled'] as const;

/** UTC-Tagesanfang — dieselbe Tagesgrenze wie überall im Backend. */
function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** CaseParticipantStatus → Posteingang-Status (teil_erledigt zählt als angenommen). */
function invitationStatus(status: string): NachrichtStatus {
  switch (status) {
    case 'eingeladen':
      return 'offen';
    case 'abgelehnt':
      return 'abgelehnt';
    case 'entfernt':
      return 'entfernt';
    default:
      return 'angenommen';
  }
}

/**
 * Mitarbeiter-Seite der Zusammenarbeit (Konzept beleg-zusammenarbeit §3/§7):
 * Kolleg:innen einladen, Einladungen beantworten, Posteingang „Nachrichten",
 * „Teilbeleg erledigt". Beteiligung ist ein Overlay — der Beleg bleibt in genau
 * EINEM Bündel (§2); jede Aktion schreibt Audit-Events und adressiert die
 * Live-Empfänger (Inhaber + aktive Beteiligte, bei Einladungen die Eingeladenen).
 */
@Injectable()
export class CollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventLogService,
    private readonly live: LiveStatusService,
    private readonly clock: ClockService,
  ) {}

  private async resolveEmployee(
    principal: Principal,
  ): Promise<{ id: string; employeeNo: string; displayName: string }> {
    if (!principal.employeeNo) {
      throw new ForbiddenException('Token has no employee number claim');
    }
    const user = await this.prisma.user.findUnique({
      where: { employeeNo: principal.employeeNo },
      select: { id: true, employeeNo: true, displayName: true, active: true },
    });
    if (!user || !user.active) {
      throw new ForbiddenException('Employee not provisioned or inactive');
    }
    return { id: user.id, employeeNo: user.employeeNo, displayName: user.displayName };
  }

  /**
   * Aktive Kolleg:innen (Employee-Rolle) ohne den Aufrufer — die Liste des
   * „Beleg teilen"-Dialogs (§3.1). `shiftToday` kommt aus der materialisierten
   * Schicht des Tages (ClockService, Dev-Zeit-Override inklusive); heute im
   * Dienst zuerst, dann Name.
   */
  async listColleagues(principal: Principal): Promise<ColleagueDto[]> {
    const me = await this.resolveEmployee(principal);
    const today = startOfDayUtc(await this.clock.now());
    const users = await this.prisma.user.findMany({
      where: {
        active: true,
        id: { not: me.id },
        roles: { some: { role: { name: 'employee' } } },
      },
      select: {
        employeeNo: true,
        displayName: true,
        shifts: { where: { date: today }, select: { active: true, netCapacityMinutes: true } },
      },
    });
    return users
      .map((u) => ({
        employeeNo: u.employeeNo,
        displayName: u.displayName,
        shiftToday: u.shifts.some((s) => s.active && s.netCapacityMinutes > 0),
      }))
      .sort(
        (a, b) =>
          Number(b.shiftToday) - Number(a.shiftToday) ||
          a.displayName.localeCompare(b.displayName, 'de'),
      );
  }

  /**
   * Einladen (§3.1/§7): Beleg muss `assigned|in_progress|problem_resolved` sein;
   * einladen darf der Inhaber und jeder AKTIVE Beteiligte. Die Inhaber-Zeile
   * entsteht beim ersten Einladen (`angenommen`, Konzept §6); Helfer werden
   * `eingeladen` — Abgelehnte/Entfernte erneut. Antwort ist der frische
   * Zusammenarbeits-Stand des Belegs.
   */
  async invite(
    principal: Principal,
    caseId: string,
    dto: InviteParticipantsDto,
  ): Promise<CaseCollaborationDto> {
    const me = await this.resolveEmployee(principal);
    const found = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        status: true,
        weBelegNo: true,
        assignedBundle: { select: { employee: { select: { id: true, employeeNo: true } } } },
        participants: {
          select: {
            id: true,
            status: true,
            employeeId: true,
            employee: { select: { employeeNo: true } },
          },
        },
      },
    });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);
    const owner = found.assignedBundle?.employee ?? null;
    const activeNos = found.participants
      .filter((p) => (ACTIVE_PARTICIPANT_STATUSES as readonly string[]).includes(p.status))
      .map((p) => p.employee.employeeNo);
    const callerAllowed = owner?.employeeNo === me.employeeNo || activeNos.includes(me.employeeNo);
    if (!callerAllowed) {
      // §16.1-Maskierung: fremde Belege lesen sich als 404 — Eingeladene, die
      // noch nicht angenommen haben, sehen den Beleg ebenfalls nicht (§5.1).
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    if (!(INVITABLE_CASE_STATUSES as readonly string[]).includes(found.status)) {
      throw new ConflictException(
        'Einladen geht nur, solange der Beleg zugeteilt ist und bearbeitet wird',
      );
    }
    if (owner === null) {
      // assigned|in_progress|problem_resolved implizieren ein Bündel — reine Absicherung.
      throw new ConflictException('Der Beleg liegt in keinem Karren');
    }

    // Sich selbst und den Inhaber lädt niemand ein — die Inhaber-Zeile entsteht implizit.
    const targetNos = [...new Set(dto.employeeNos)].filter(
      (no) => no !== me.employeeNo && no !== owner.employeeNo,
    );
    if (targetNos.length === 0) {
      throw new BadRequestException(
        'Niemand einzuladen – mindestens eine Kollegin/einen Kollegen wählen',
      );
    }
    const targets = await this.prisma.user.findMany({
      where: { employeeNo: { in: targetNos } },
      select: { id: true, employeeNo: true, active: true },
    });
    const targetByNo = new Map(targets.map((t) => [t.employeeNo, t]));
    for (const no of targetNos) {
      const target = targetByNo.get(no);
      if (!target || !target.active) {
        throw new BadRequestException(`Mitarbeiter ${no} ist unbekannt oder inaktiv`);
      }
    }

    const participantByEmployeeId = new Map(found.participants.map((p) => [p.employeeId, p]));
    const now = await this.clock.now();
    const message = dto.message?.trim() ? dto.message.trim() : null;
    const invitedNos: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      // Inhaber-Zeile beim ersten Einladen (Konzept §6): angenommen — sie trägt
      // später sein „Teilbeleg erledigt". createMany+skipDuplicates statt create:
      // laden zwei Beteiligte gleichzeitig ein, darf der Unique
      // participant_case_employee nicht als P2002→500 durchschlagen.
      if (!participantByEmployeeId.has(owner.id)) {
        await tx.caseParticipant.createMany({
          data: [
            {
              caseId: found.id,
              employeeId: owner.id,
              role: 'inhaber',
              status: 'angenommen',
              invitedById: me.id,
              invitedByLabel: me.displayName,
              invitedAt: now,
              respondedAt: now,
            },
          ],
          skipDuplicates: true,
        });
      }
      for (const no of targetNos) {
        const target = targetByNo.get(no);
        if (!target) continue;
        if (participantByEmployeeId.get(target.id) === undefined) {
          const created = await tx.caseParticipant.createMany({
            data: [
              {
                caseId: found.id,
                employeeId: target.id,
                role: 'helfer',
                status: 'eingeladen',
                invitedById: me.id,
                invitedByLabel: me.displayName,
                message,
                invitedAt: now,
              },
            ],
            skipDuplicates: true,
          });
          if (created.count === 1) {
            invitedNos.push(no);
            continue;
          }
          // Zeile ist parallel entstanden — unten wie „bereits beteiligt" behandeln.
        }
        // Erneute Einladung (§3.4): zurück auf eingeladen, Antwort-Felder leeren.
        // Vorbedingung im Statement statt Stale-Read: ein konkurrierend gesetztes
        // angenommen/teil_erledigt wird nie auf eingeladen zurückgedreht.
        const revived = await tx.caseParticipant.updateMany({
          where: {
            caseId: found.id,
            employeeId: target.id,
            status: { in: ['abgelehnt', 'entfernt'] },
          },
          data: {
            status: 'eingeladen',
            invitedById: me.id,
            invitedByLabel: me.displayName,
            message,
            invitedAt: now,
            respondedAt: null,
            partDoneAt: null,
            removedAt: null,
            removedByLabel: null,
          },
        });
        if (revived.count > 0) invitedNos.push(no);
        // eingeladen/angenommen/teil_erledigt: bereits beteiligt — nichts zu tun.
      }
      if (invitedNos.length > 0) {
        await this.events.append(
          {
            eventType: 'case.collaboration_invited',
            entityType: 'GoodsReceiptCase',
            entityId: found.id,
            actorType: 'employee',
            actorId: principal.sub,
            payload: { employeeNos: invitedNos, message, invitedBy: me.employeeNo },
          },
          tx,
        );
      }
    });

    if (invitedNos.length > 0) {
      const at = now.toISOString();
      // Einladungs-Signal an die Eingeladenen; Änderungs-Signal an Inhaber + Beteiligte.
      this.live.publish({
        type: 'collaboration.invited',
        recipients: invitedNos,
        caseId: found.id,
        status: null,
        actorEmployeeNo: me.employeeNo,
        positionId: null,
        at,
      });
      this.live.publish({
        type: 'collaboration.changed',
        recipients: await recipientsForCase(this.prisma, found.id),
        caseId: found.id,
        status: null,
        actorEmployeeNo: me.employeeNo,
        positionId: null,
        at,
      });
    }

    const collaboration = await loadCollaborationDto(this.prisma, found.id);
    // Nach dem Einladen existiert immer mindestens die Inhaber-Zeile.
    return collaboration ?? { positionCount: 0, confirmedPositionCount: 0, participants: [] };
  }

  /**
   * Einladung beantworten (§3.4/§3.5): nur der Eingeladene selbst, nur aus
   * `eingeladen`. Annehmen macht den Beleg unter „Geteilt mit dir" sichtbar;
   * Ablehnen bleibt nur im Verlauf — eine erneute Einladung ist möglich.
   */
  async respond(
    principal: Principal,
    participantId: string,
    dto: RespondInvitationDto,
  ): Promise<ParticipantStatusResultDto> {
    const me = await this.resolveEmployee(principal);
    const participant = await this.prisma.caseParticipant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        caseId: true,
        status: true,
        employeeId: true,
        case: { select: { status: true, assignedBundleId: true } },
      },
    });
    if (!participant || participant.employeeId !== me.id) {
      // Fremde Einladungen lesen sich als 404 (§16.1-Maskierung).
      throw new NotFoundException(`Einladung ${participantId} nicht gefunden`);
    }
    if (participant.status !== 'eingeladen') {
      throw new ConflictException('Diese Einladung wurde bereits beantwortet');
    }
    if (
      dto.accept &&
      (participant.case.assignedBundleId === null ||
        !(ACCEPTABLE_CASE_STATUSES as readonly string[]).includes(participant.case.status))
    ) {
      // §5.5: hat der Beleg den Karren verlassen oder ist er fertig, entsteht
      // aus der liegen gebliebenen Einladung keine Beteiligung mehr. Ablehnen
      // bleibt erlaubt — es räumt nur den Posteingang auf.
      throw new ConflictException(
        'Die Einladung ist verfallen – der Beleg wird nicht mehr so bearbeitet',
      );
    }
    const now = await this.clock.now();
    const status = dto.accept ? 'angenommen' : 'abgelehnt';
    await this.prisma.$transaction(async (tx) => {
      // Vorbedingung im Statement: eine parallel beantwortete/entfernte
      // Einladung wird nicht stillschweigend überschrieben.
      const res = await tx.caseParticipant.updateMany({
        where: { id: participant.id, status: 'eingeladen' },
        data: { status, respondedAt: now },
      });
      if (res.count === 0) {
        throw new ConflictException('Diese Einladung wurde bereits beantwortet');
      }
      await this.events.append(
        {
          eventType: dto.accept ? 'case.collaboration_accepted' : 'case.collaboration_declined',
          entityType: 'GoodsReceiptCase',
          entityId: participant.caseId,
          actorType: 'employee',
          actorId: principal.sub,
          payload: { participantId: participant.id, employeeNo: me.employeeNo },
        },
        tx,
      );
    });
    // Bei Ablehnung ist der Antwortende kein Empfänger mehr — trotzdem adressieren,
    // damit seine eigenen Geräte den Posteingang nachladen.
    const recipients = [
      ...new Set([...(await recipientsForCase(this.prisma, participant.caseId)), me.employeeNo]),
    ];
    this.live.publish({
      type: 'collaboration.changed',
      recipients,
      caseId: participant.caseId,
      status: null,
      actorEmployeeNo: me.employeeNo,
      positionId: null,
      at: now.toISOString(),
    });
    return {
      participantId: participant.id,
      caseId: participant.caseId,
      employeeNo: me.employeeNo,
      status,
    };
  }

  /**
   * „Teilbeleg erledigt" (§3.7): die eigene Beteiligung `angenommen` →
   * `teil_erledigt`. Ein Zustand des BETEILIGTEN — keine Zustandsänderung am
   * Beleg, keine ZST-Buchung (§5.3). Weiter mithelfen bleibt erlaubt.
   */
  async partDone(principal: Principal, caseId: string): Promise<ParticipantStatusResultDto> {
    const me = await this.resolveEmployee(principal);
    const participant = await this.prisma.caseParticipant.findUnique({
      where: { participant_case_employee: { caseId, employeeId: me.id } },
      select: { id: true, status: true, case: { select: { status: true } } },
    });
    // Eigener Status ZUERST (§16.1/§5.1): Eingeladene, Abgelehnte und Entfernte
    // lesen sich als 404 und erfahren auch über die Fehlermeldung nicht, ob der
    // fremde Beleg inzwischen fertig ist.
    if (
      !participant ||
      !(ACTIVE_PARTICIPANT_STATUSES as readonly string[]).includes(participant.status)
    ) {
      throw new NotFoundException(`Keine Beteiligung an Beleg ${caseId}`);
    }
    if (participant.status === 'teil_erledigt') {
      throw new ConflictException('Dein Teil ist bereits erledigt');
    }
    if ((TERMINAL_CASE_STATUSES as readonly string[]).includes(participant.case.status)) {
      throw new ConflictException('Der Beleg ist bereits fertig');
    }
    const now = await this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      // Vorbedingung im Statement: ein paralleles Entfernen durch den Teamlead
      // gewinnt — der soeben Entfernte wird nicht wieder aktiv.
      const res = await tx.caseParticipant.updateMany({
        where: { id: participant.id, status: 'angenommen' },
        data: { status: 'teil_erledigt', partDoneAt: now },
      });
      if (res.count === 0) {
        throw new ConflictException('Die Beteiligung hat sich gerade geändert – bitte neu laden');
      }
      await this.events.append(
        {
          eventType: 'case.collaboration_part_done',
          entityType: 'GoodsReceiptCase',
          entityId: caseId,
          actorType: 'employee',
          actorId: principal.sub,
          payload: { participantId: participant.id, employeeNo: me.employeeNo },
        },
        tx,
      );
    });
    this.live.publish({
      type: 'collaboration.changed',
      recipients: await recipientsForCase(this.prisma, caseId),
      caseId,
      status: null,
      actorEmployeeNo: me.employeeNo,
      positionId: null,
      at: now.toISOString(),
    });
    return {
      participantId: participant.id,
      caseId,
      employeeNo: me.employeeNo,
      status: 'teil_erledigt',
    };
  }

  /**
   * Posteingang „Nachrichten" (§3.3): erhaltene und gesendete Einladungen (alle
   * Status) plus Teamlead-Nachrichten, neueste zuerst. `pendingCount` = offene
   * Einladungen an mich + ungelesene Teamlead-Nachrichten — die Zahl am
   * Profilkreis. Einladungen sind immer persistiert; Live beschleunigt nur.
   */
  async posteingang(principal: Principal): Promise<PosteingangDto> {
    const me = await this.resolveEmployee(principal);
    const [received, sent, teamleadMessages, unreadCount] = await Promise.all([
      this.prisma.caseParticipant.findMany({
        where: { employeeId: me.id, role: 'helfer' },
        select: {
          id: true,
          status: true,
          message: true,
          invitedAt: true,
          respondedAt: true,
          invitedByLabel: true,
          case: { select: { id: true, weBelegNo: true } },
        },
      }),
      this.prisma.caseParticipant.findMany({
        where: { invitedById: me.id, role: 'helfer', employeeId: { not: me.id } },
        select: {
          id: true,
          status: true,
          message: true,
          invitedAt: true,
          respondedAt: true,
          employee: { select: { displayName: true } },
          case: { select: { id: true, weBelegNo: true } },
        },
      }),
      // Alle (nicht nur ungelesene) — der Verlauf zeigt „wie reagiert wurde".
      this.prisma.teamleadMessage.findMany({
        where: { employee: { employeeNo: me.employeeNo } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, caseId: true, text: true, createdAt: true, readAt: true },
      }),
      this.prisma.teamleadMessage.count({
        where: { readAt: null, employee: { employeeNo: me.employeeNo } },
      }),
    ]);

    const messageCaseIds = teamleadMessages
      .map((m) => m.caseId)
      .filter((id): id is string => id !== null);
    const messageCases = messageCaseIds.length
      ? await this.prisma.goodsReceiptCase.findMany({
          where: { id: { in: messageCaseIds } },
          select: { id: true, weBelegNo: true },
        })
      : [];
    const weNoById = new Map(messageCases.map((c) => [c.id, c.weBelegNo]));

    const items: NachrichtDto[] = [
      ...received.map(
        (p): NachrichtDto => ({
          id: p.id,
          kind: 'einladung_erhalten',
          caseId: p.case.id,
          weBelegNo: p.case.weBelegNo,
          fromLabel: p.invitedByLabel,
          toLabel: me.displayName,
          text: p.message,
          createdAt: p.invitedAt.toISOString(),
          status: invitationStatus(p.status),
          respondedAt: p.respondedAt?.toISOString() ?? null,
          participantId: p.id,
        }),
      ),
      ...sent.map(
        (p): NachrichtDto => ({
          id: p.id,
          kind: 'einladung_gesendet',
          caseId: p.case.id,
          weBelegNo: p.case.weBelegNo,
          fromLabel: me.displayName,
          toLabel: p.employee.displayName,
          text: p.message,
          createdAt: p.invitedAt.toISOString(),
          status: invitationStatus(p.status),
          respondedAt: p.respondedAt?.toISOString() ?? null,
          participantId: p.id,
        }),
      ),
      ...teamleadMessages.map(
        (m): NachrichtDto => ({
          id: m.id,
          kind: 'teamlead',
          caseId: m.caseId,
          weBelegNo: m.caseId !== null ? (weNoById.get(m.caseId) ?? null) : null,
          fromLabel: 'Teamleitung',
          toLabel: me.displayName,
          text: m.text,
          createdAt: m.createdAt.toISOString(),
          status: m.readAt !== null ? 'gelesen' : 'ungelesen',
          respondedAt: m.readAt?.toISOString() ?? null,
          participantId: null,
        }),
      ),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const pendingInvitations = received.filter((p) => p.status === 'eingeladen').length;
    return { pendingCount: pendingInvitations + unreadCount, items };
  }
}
