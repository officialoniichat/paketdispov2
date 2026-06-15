import { Injectable, NotFoundException } from '@nestjs/common';
import { PriorityFlag, type AssignmentStatus, type CaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { LiveStatusService } from '../live/live.module.js';
import type { Principal } from '../auth/rbac.js';
import {
  type AuditEventDto,
  type BoardDto,
  type BoardRowDto,
  type CapacityDto,
  type DashboardDto,
  type EventQueryDto,
  type KpiDto,
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

/** Case statuses that count as "done" for KPI completion (Anhang A). */
const COMPLETED_STATUSES: CaseStatus[] = ['completed', 'zst_done'];
/** Bundle statuses excluded from planned-effort capacity math. */
const INACTIVE_BUNDLE_STATUSES: AssignmentStatus[] = ['cancelled', 'completed'];

/** Inclusive UTC day window [start, end] for a YYYY-MM-DD calendar day. */
function dayWindow(date: string): { start: Date; end: Date } {
  return { start: new Date(`${date}T00:00:00.000Z`), end: new Date(`${date}T23:59:59.999Z`) };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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

  // --- Read endpoints (§10/§11 cockpit) -------------------------------------

  /**
   * §10.3 Mitarbeitenden-Board: the day's assigned bundles grouped per employee,
   * with member cases + route stops + capacity. reserveMinutes = Σ capacity −
   * Σ planned across the rows.
   */
  async board(date: string): Promise<BoardDto> {
    const day = new Date(`${date}T00:00:00.000Z`);
    const [bundles, shifts] = await Promise.all([
      this.prisma.assignmentBundle.findMany({
        where: { date: day },
        include: {
          employee: { select: { employeeNo: true, displayName: true } },
          items: {
            orderBy: { sequence: 'asc' },
            include: {
              case: {
                select: {
                  id: true,
                  weBelegNo: true,
                  status: true,
                  totalQuantity: true,
                  estimatedMinutes: true,
                  effortPoints: true,
                },
              },
            },
          },
          routeStops: { orderBy: { sequence: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.shift.findMany({ where: { date: day, active: true } }),
    ]);

    const capacityByEmployee = new Map<string, number>();
    for (const s of shifts) {
      capacityByEmployee.set(
        s.employeeId,
        (capacityByEmployee.get(s.employeeId) ?? 0) + s.netCapacityMinutes,
      );
    }

    // One row per employee (the engine may split an employee's work across
    // several bundles; merge them so the board mirrors the §10.3 per-employee
    // view and capacity is counted once).
    const rowByEmployee = new Map<string, BoardRowDto>();
    for (const b of bundles) {
      let row = rowByEmployee.get(b.employeeId);
      if (!row) {
        row = {
          employeeNo: b.employee.employeeNo,
          employeeName: b.employee.displayName,
          bundleId: b.id,
          bundleStatus: b.status,
          plannedEffortMinutes: 0,
          capacityMinutes: capacityByEmployee.get(b.employeeId) ?? 0,
          cases: [],
          routeStops: [],
        };
        rowByEmployee.set(b.employeeId, row);
      }
      row.plannedEffortMinutes += b.plannedEffortMinutes;
      for (const it of b.items) {
        row.cases.push({
          id: it.case.id,
          weBelegNo: it.case.weBelegNo,
          status: it.case.status,
          totalQuantity: it.case.totalQuantity,
          estimatedMinutes: it.case.estimatedMinutes,
          effortPoints: it.case.effortPoints,
        });
      }
      for (const rs of b.routeStops) {
        row.routeStops.push({
          id: rs.id,
          sequence: rs.sequence,
          locationCode: rs.locationCode,
          scanRequired: rs.scanRequired,
          scanned: rs.scannedAt !== null,
        });
      }
    }

    const rows = [...rowByEmployee.values()];
    const totalCapacity = rows.reduce((sum, r) => sum + r.capacityMinutes, 0);
    const totalPlanned = rows.reduce((sum, r) => sum + r.plannedEffortMinutes, 0);
    return { date, rows, reserveMinutes: totalCapacity - totalPlanned };
  }

  /**
   * §10.1 Tagescockpit capacity tile. Mirrors buildCockpitSummary (teamlead-web
   * selectors): net = Σ active shift net minutes; planned = Σ planned effort of
   * non-cancelled/non-completed bundles; reserve = net − planned.
   */
  async capacity(date: string): Promise<CapacityDto> {
    const day = new Date(`${date}T00:00:00.000Z`);
    const [shifts, bundles] = await Promise.all([
      this.prisma.shift.findMany({ where: { date: day, active: true } }),
      this.prisma.assignmentBundle.findMany({
        where: { date: day, status: { notIn: INACTIVE_BUNDLE_STATUSES } },
        select: { plannedEffortMinutes: true },
      }),
    ]);

    const netCapacityMinutes = shifts.reduce((sum, s) => sum + s.netCapacityMinutes, 0);
    const plannedMinutes = bundles.reduce((sum, b) => sum + b.plannedEffortMinutes, 0);
    const reserveMinutes = netCapacityMinutes - plannedMinutes;
    const utilisationPct =
      netCapacityMinutes === 0 ? 0 : round1((plannedMinutes / netCapacityMinutes) * 100);

    return {
      date,
      plannedEmployees: shifts.length,
      netCapacityMinutes,
      plannedMinutes,
      reserveMinutes,
      utilisationPct,
    };
  }

  /**
   * §10.1 ZST KPI tile. Aggregates ZstRecord completed on the day + case
   * statuses, replacing the hardcoded demo constants. workedMinutes is derived
   * from each ZST record's elapsed time (startedAt → completedAt); records
   * without a startedAt contribute 0 (no surrogate time invented).
   */
  async kpis(date: string): Promise<KpiDto> {
    const { start, end } = dayWindow(date);
    const day = new Date(`${date}T00:00:00.000Z`);
    const [zstRecords, totalCases, completedCases] = await Promise.all([
      this.prisma.zstRecord.findMany({
        where: { completedAt: { gte: start, lte: end } },
        select: { completedQuantity: true, effortPoints: true, startedAt: true, completedAt: true },
      }),
      this.prisma.goodsReceiptCase.count({ where: { bookingDate: day } }),
      this.prisma.goodsReceiptCase.count({
        where: { bookingDate: day, status: { in: COMPLETED_STATUSES } },
      }),
    ]);

    let completedParts = 0;
    let effortPoints = 0;
    let workedMinutes = 0;
    for (const z of zstRecords) {
      completedParts += z.completedQuantity;
      effortPoints += z.effortPoints;
      if (z.startedAt) {
        workedMinutes += (z.completedAt.getTime() - z.startedAt.getTime()) / 60_000;
      }
    }

    const hours = workedMinutes / 60;
    const partsPerHour = hours === 0 ? 0 : Math.round(completedParts / hours);
    const effortPointsPerHour = hours === 0 ? 0 : Math.round(effortPoints / hours);

    return {
      date,
      completedCases,
      totalCases,
      completedParts,
      effortPoints,
      workedMinutes: Math.round(workedMinutes),
      partsPerHour,
      effortPointsPerHour,
    };
  }

  /**
   * §7.2/§16.2 audit feed: the append-only WorkflowEvent log newest-first, with
   * optional actorType/entityId filters. action/reason are projected out of the
   * event payload JSON (best-effort, since payload shape varies by event type).
   */
  async auditEvents(query: EventQueryDto): Promise<AuditEventDto[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const rows = await this.prisma.workflowEvent.findMany({
      where: {
        ...(query.actorType ? { actorType: query.actorType as never } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit,
    });

    return rows.map((e) => {
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      const action = typeof payload['action'] === 'string' ? payload['action'] : undefined;
      const reason = typeof payload['reason'] === 'string' ? payload['reason'] : undefined;
      return {
        id: e.id,
        seq: Number(e.seq),
        at: e.timestamp.toISOString(),
        actorType: e.actorType,
        actorId: e.actorId ?? '',
        eventType: e.eventType,
        entityType: e.entityType,
        entityId: e.entityId,
        action,
        reason,
      };
    });
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
