import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Principal } from '../auth/rbac.js';
import {
  MessageReadDto,
  MyMessageListDto,
  SendMessageDto,
  TeamleadMessageDto,
  TeamleadMessageListDto,
} from './messages.dto.js';

/**
 * Teamlead-Nachrichten an die Mitarbeiter-App (z. B. bei Vorverteilungs-
 * Eingriffen): Senden + Lesestatus für den Teamlead, ungelesene Nachrichten +
 * „Gelesen"-Quittung für den Mitarbeiter — immer strikt auf den eigenen
 * Datensatz gescoped (§16.1).
 */
@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** WE-Nrn der Bezugs-Belege (Anzeige); Nachrichten ohne Bezug bleiben null. */
  private async weNoByCaseId(caseIds: Array<string | null>): Promise<Map<string, string>> {
    const ids = caseIds.filter((id): id is string => id !== null);
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.goodsReceiptCase.findMany({
      where: { id: { in: ids } },
      select: { id: true, weBelegNo: true },
    });
    return new Map(rows.map((r) => [r.id, r.weBelegNo]));
  }

  async send(principal: Principal, dto: SendMessageDto): Promise<TeamleadMessageDto> {
    const employee = await this.prisma.user.findUnique({
      where: { employeeNo: dto.employeeNo },
      select: { id: true, active: true, displayName: true, employeeNo: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${dto.employeeNo} not found`);
    if (!employee.active) throw new ConflictException(`Employee ${dto.employeeNo} is inactive`);

    const row = await this.prisma.teamleadMessage.create({
      data: {
        employeeId: employee.id,
        caseId: dto.caseId ?? null,
        text: dto.text,
        createdBy: principal.sub,
      },
    });
    const weNos = await this.weNoByCaseId([row.caseId]);
    return {
      id: row.id,
      employeeNo: employee.employeeNo,
      employeeName: employee.displayName,
      caseId: row.caseId,
      weBelegNo: row.caseId !== null ? (weNos.get(row.caseId) ?? null) : null,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    };
  }

  /** Letzte 50 gesendete Nachrichten (neueste zuerst) inkl. Lesestatus. */
  async listSent(): Promise<TeamleadMessageListDto> {
    const rows = await this.prisma.teamleadMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { employee: { select: { employeeNo: true, displayName: true } } },
    });
    const weNos = await this.weNoByCaseId(rows.map((r) => r.caseId));
    return {
      messages: rows.map((r) => ({
        id: r.id,
        employeeNo: r.employee.employeeNo,
        employeeName: r.employee.displayName,
        caseId: r.caseId,
        weBelegNo: r.caseId !== null ? (weNos.get(r.caseId) ?? null) : null,
        text: r.text,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt?.toISOString() ?? null,
      })),
    };
  }

  /** Ungelesene Nachrichten des angemeldeten Mitarbeiters (älteste zuerst). */
  async unreadForMe(principal: Principal): Promise<MyMessageListDto> {
    const employeeNo = principal.employeeNo;
    if (employeeNo === undefined) throw new ForbiddenException('No employee identity in token');
    const rows = await this.prisma.teamleadMessage.findMany({
      where: { readAt: null, employee: { employeeNo } },
      orderBy: { createdAt: 'asc' },
    });
    const weNos = await this.weNoByCaseId(rows.map((r) => r.caseId));
    return {
      messages: rows.map((r) => ({
        id: r.id,
        text: r.text,
        caseId: r.caseId,
        weBelegNo: r.caseId !== null ? (weNos.get(r.caseId) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** „Gelesen"-Quittung — nur für die eigene Nachricht möglich (§16.1). */
  async markRead(principal: Principal, id: string, now: Date = new Date()): Promise<MessageReadDto> {
    const employeeNo = principal.employeeNo;
    if (employeeNo === undefined) throw new ForbiddenException('No employee identity in token');
    const result = await this.prisma.teamleadMessage.updateMany({
      where: { id, readAt: null, employee: { employeeNo } },
      data: { readAt: now },
    });
    if (result.count === 0) throw new NotFoundException(`Message ${id} not found or already read`);
    return { id, readAt: now.toISOString() };
  }
}
