import { Injectable, NotFoundException } from '@nestjs/common';
import { PriorityFlag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { LiveStatusService } from '../live/live.module.js';
import type { Principal } from '../auth/rbac.js';
import {
  type DashboardDto,
  type ParkDto,
  type PoolItemDto,
  type PoolListDto,
  type PoolQueryDto,
  type PrioritizeDto,
  type ReleaseDto,
  type ResolveIssueDto,
  type TransitionResultDto,
} from './cases.dto.js';

const OPEN_PRIORITY_FLAGS: PriorityFlag[] = ['prio', 'catman_due', 'overdue', 'same_day_required'];

/**
 * Teamlead pool steering (§14.2 /api/teamlead/*). Teamlead sees the full
 * operational pool and may park, prioritise, and resolve/release issues.
 */
@Injectable()
export class TeamleadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly events: EventLogService,
    private readonly live: LiveStatusService,
  ) {}

  async listPool(query: PoolQueryDto): Promise<PoolListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.section !== undefined ? { section: query.section } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.goodsReceiptCase.findMany({
        where,
        include: {
          storageLocation: { select: { code: true } },
          assignedBundle: { select: { employee: { select: { employeeNo: true } } } },
        },
        orderBy: [{ bookingDate: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.goodsReceiptCase.count({ where }),
    ]);

    const items: PoolItemDto[] = rows.map((c) => ({
      id: c.id,
      weBelegNo: c.weBelegNo,
      status: c.status,
      section: c.section,
      priorityFlags: c.priorityFlags,
      totalQuantity: c.totalQuantity,
      estimatedMinutes: c.estimatedMinutes,
      storageLocationCode: c.storageLocation.code,
      bookingDate: c.bookingDate.toISOString().slice(0, 10),
      assignedEmployeeNo: c.assignedBundle?.employee?.employeeNo ?? null,
      effortPoints: c.effortPoints,
    }));

    return { items, total, page, limit };
  }

  async dashboard(): Promise<DashboardDto> {
    const grouped = await this.prisma.goodsReceiptCase.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const countsByStatus: Record<string, number> = {};
    for (const g of grouped) countsByStatus[g.status] = g._count._all;

    const poolSize = (countsByStatus['ready'] ?? 0) + (countsByStatus['parked'] ?? 0);
    const prioOpen = await this.prisma.goodsReceiptCase.count({
      where: {
        priorityFlags: { hasSome: OPEN_PRIORITY_FLAGS },
        status: { notIn: ['completed', 'zst_done', 'cancelled'] },
      },
    });
    const oldest = await this.prisma.goodsReceiptCase.findFirst({
      where: { status: { notIn: ['completed', 'zst_done', 'cancelled'] } },
      orderBy: { bookingDate: 'asc' },
      select: { bookingDate: true },
    });

    return {
      countsByStatus,
      poolSize,
      prioOpen,
      oldestOpenBookingDate: oldest ? oldest.bookingDate.toISOString().slice(0, 10) : null,
    };
  }

  park(principal: Principal, caseId: string, dto: ParkDto): Promise<TransitionResultDto> {
    return this.transition(caseId, 'parked', 'case.parked', principal, { reason: dto.reason });
  }

  unpark(principal: Principal, caseId: string): Promise<TransitionResultDto> {
    return this.transition(caseId, 'ready', 'case.ready', principal);
  }

  async prioritize(
    principal: Principal,
    caseId: string,
    dto: PrioritizeDto,
  ): Promise<TransitionResultDto> {
    const found = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true, version: true, priorityFlags: true },
    });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);

    const flags = new Set<PriorityFlag>(found.priorityFlags);
    flags.add('manual_teamlead_priority');

    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceiptCase.update({
        where: { id: caseId },
        data: { priorityFlags: [...flags], version: { increment: 1 } },
      });
      await this.events.append(
        {
          eventType: 'case.prioritized',
          entityType: 'GoodsReceiptCase',
          entityId: caseId,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: { reason: dto.reason },
        },
        tx,
      );
    });

    return { caseId, status: found.status, version: found.version + 1, eventId: null };
  }

  async resolveIssue(
    principal: Principal,
    issueId: string,
    dto: ResolveIssueDto,
  ): Promise<TransitionResultDto> {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, caseId: true },
    });
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    return this.prisma.$transaction(async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        data: { status: 'in_review', resolution: dto.resolution },
      });
      const result = await this.workflow.transition({
        caseId: issue.caseId,
        toStatus: 'waiting_teamlead',
        eventType: 'issue.resolved',
        actor: { actorType: 'teamlead', actorId: principal.sub },
        payload: { issueId },
      });
      return this.toResult(result);
    });
  }

  async releaseIssue(
    principal: Principal,
    issueId: string,
    dto: ReleaseDto,
  ): Promise<TransitionResultDto> {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, caseId: true },
    });
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    return this.prisma.$transaction(async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        data: { status: 'resolved', releasedBy: principal.sub, releasedAt: new Date() },
      });
      // waiting_teamlead → released → resume at checking (operational continuation).
      await this.workflow.transition({
        caseId: issue.caseId,
        toStatus: 'released',
        actor: { actorType: 'teamlead', actorId: principal.sub },
        payload: { issueId, note: dto.note },
      });
      const result = await this.workflow.transition({
        caseId: issue.caseId,
        toStatus: 'checking',
        actor: { actorType: 'teamlead', actorId: principal.sub },
      });
      return this.toResult(result);
    });
  }

  private async transition(
    caseId: string,
    toStatus: Parameters<WorkflowService['transition']>[0]['toStatus'],
    eventType: Parameters<WorkflowService['transition']>[0]['eventType'],
    principal: Principal,
    payload?: unknown,
  ): Promise<TransitionResultDto> {
    const result = await this.workflow.transition({
      caseId,
      toStatus,
      eventType,
      actor: { actorType: 'teamlead', actorId: principal.sub },
      payload,
    });
    return this.toResult(result);
  }

  private toResult(result: {
    caseId: string;
    status: string;
    version: number;
    event: { id: string } | null;
  }): TransitionResultDto {
    this.live.publish({
      caseId: result.caseId,
      status: result.status,
      employeeNo: null,
      at: new Date().toISOString(),
    });
    return {
      caseId: result.caseId,
      status: result.status,
      version: result.version,
      eventId: result.event?.id ?? null,
    };
  }
}
