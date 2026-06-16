import { Injectable, NotFoundException } from '@nestjs/common';
import type { AssignmentStatus, CaseStatus, PriorityFlag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type AuditEventDto,
  type BoardDto,
  type BoardRowDto,
  type CapacityDto,
  type CaseDetailDto,
  type CaseSummaryDto,
  type DashboardDto,
  type EventQueryDto,
  type KpiDto,
  type PoolItemDto,
  type PoolListDto,
  type PoolQueryDto,
  type PositionDetailDto,
  type SkuLineDto,
} from './cases.dto.js';
import { mapBoxTarget, mapWorkInstruction } from './mappers.js';

/** Priority flags counted as an "open prio" case in the dashboard tile. */
const OPEN_PRIORITY_FLAGS: PriorityFlag[] = ['prio', 'catman_due', 'overdue', 'same_day_required'];
/** Case statuses that count as "done" for KPI completion (Anhang A). */
const COMPLETED_STATUSES: CaseStatus[] = ['completed', 'zst_done'];
/** Bundle statuses excluded from planned-effort capacity math. */
const INACTIVE_BUNDLE_STATUSES: AssignmentStatus[] = ['cancelled', 'completed'];

/** Inclusive UTC day window [start, end] for a YYYY-MM-DD calendar day. */
function dayWindow(date: string): { start: Date; end: Date } {
  return { start: new Date(`${date}T00:00:00.000Z`), end: new Date(`${date}T23:59:59.999Z`) };
}

/** YYYY-MM-DD slice of a Date, or null when absent. */
function isoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Type guard: a freeform JSON value that is a plain (non-array) object. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read an optional string field from a freeform audit `payload` (Prisma `Json`),
 * narrowing `unknown` safely via {@link isJsonObject}: non-object/array payloads
 * and non-string values yield `undefined` rather than forcing a cast.
 */
function readStringField(payload: unknown, key: string): string | undefined {
  if (!isJsonObject(payload)) return undefined;
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read side of the teamlead surface (§10/§11): pure, non-mutating projections of
 * the operational pool, day board, capacity/KPI tiles, the §7.2 audit feed, and
 * the §10.4 Belegdetails. Kept separate from the command service (park/prioritize
 * /bundle overrides) so read vs. write responsibilities stay cleanly isolated —
 * it depends on nothing but Prisma.
 */
@Injectable()
export class TeamleadReadService {
  constructor(private readonly prisma: PrismaService) {}

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
          assignedBundle: {
            select: { employee: { select: { employeeNo: true, displayName: true } } },
          },
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
      goodsType: c.goodsTypeText,
      assignedEmployeeName: c.assignedBundle?.employee?.displayName ?? null,
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

    // One row per employee. The engine now emits exactly ONE bundle per employee
    // per day, so this grouping is a 1:1 map (one bundle in → one row out) and
    // `row.bundleId` owns precisely `row.cases` — which is what withdraw/add/
    // reorder/pause/resume target. The per-employee fold is kept defensively so a
    // legacy multi-bundle day (pre-migration) still renders coherently.
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
   * §10.1 Tagescockpit capacity tile. net = Σ active shift net minutes; planned =
   * Σ planned effort of non-cancelled/non-completed bundles; reserve = net − planned.
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
   * statuses. workedMinutes is derived from each ZST record's elapsed time
   * (startedAt → completedAt); records without a startedAt contribute 0.
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
   * optional actorType/entityId/eventType filters. action/reason are projected
   * out of the event payload JSON (best-effort, since payload shape varies).
   */
  async auditEvents(query: EventQueryDto): Promise<AuditEventDto[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    // Optional comma-separated eventType allowlist (e.g. the cockpit's genuine
    // human-intervention set). Empty/blank entries are dropped; an all-blank list
    // is treated as "no filter" so a stray comma never silently hides every event.
    const eventTypes = (query.eventType ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const rows = await this.prisma.workflowEvent.findMany({
      where: {
        ...(query.actorType ? { actorType: query.actorType as never } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(eventTypes.length > 0 ? { eventType: { in: eventTypes } } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit,
    });

    return rows.map((e) => this.toAuditEvent(e));
  }

  /**
   * §10.4 Belegdetails: one rich case read — header + work instruction +
   * positions (with instruction flags + SKU lines) + transport boxes +
   * the case's audit history (newest first). 404 if unknown.
   */
  async caseDetail(caseId: string): Promise<CaseDetailDto> {
    const found = await this.prisma.goodsReceiptCase.findUnique({
      where: { id: caseId },
      include: {
        storageLocation: { select: { code: true } },
        assignedBundle: { select: { employee: { select: { displayName: true } } } },
        workInstruction: true,
        positions: {
          orderBy: { positionNo: 'asc' },
          include: {
            instruction: true,
            skuLines: { orderBy: { ean: 'asc' } },
          },
        },
        transportBoxes: { orderBy: { boxNo: 'asc' } },
        issues: { orderBy: { reportedAt: 'desc' } },
        zstRecords: { orderBy: { completedAt: 'asc' } },
      },
    });
    if (!found) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }

    const summary: CaseSummaryDto = {
      id: found.id,
      weBelegNo: found.weBelegNo,
      status: found.status,
      section: found.section,
      priorityFlags: found.priorityFlags,
      totalQuantity: found.totalQuantity,
      estimatedMinutes: found.estimatedMinutes,
      storageLocationCode: found.storageLocation.code,
      bookingDate: found.bookingDate.toISOString().slice(0, 10),
      goodsType: found.goodsTypeText,
      assignedEmployeeName: found.assignedBundle?.employee?.displayName ?? null,
    };

    const history = await this.auditEvents({ entityId: caseId, limit: 200 });

    return {
      case: summary,
      effortPoints: found.effortPoints,
      deliveryNoteNo: found.deliveryNoteNo,
      primaryShopAreaNo: found.primaryShopAreaNo,
      primaryFloor: found.primaryFloor,
      catManDate: isoDay(found.catManDate),
      loadPlanDate: isoDay(found.loadPlanDate),
      goodsType: found.goodsTypeText,
      workInstruction: found.workInstruction ? mapWorkInstruction(found.workInstruction) : null,
      positions: found.positions.map((p) => this.mapPositionDetail(p)),
      transportBoxes: found.transportBoxes.map((b) => mapBoxTarget(b)),
      issues: found.issues.map((i) => ({
        id: i.id,
        scope: i.scope,
        issueType: i.issueType,
        status: i.status,
        description: i.description,
        resolution: i.resolution,
        reportedAt: i.reportedAt.toISOString(),
      })),
      zstRecords: found.zstRecords.map((z) => ({
        id: z.id,
        completedQuantity: z.completedQuantity,
        effortPoints: z.effortPoints,
        completedAt: z.completedAt.toISOString(),
        exportedAt: z.exportedAt ? z.exportedAt.toISOString() : null,
        source: z.source,
      })),
      history,
    };
  }

  // --- projection helpers ---------------------------------------------------

  private toAuditEvent(e: {
    id: string;
    seq: bigint;
    timestamp: Date;
    actorType: string;
    actorId: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    payload: unknown;
  }): AuditEventDto {
    return {
      id: e.id,
      seq: Number(e.seq),
      at: e.timestamp.toISOString(),
      actorType: e.actorType,
      actorId: e.actorId ?? '',
      eventType: e.eventType,
      entityType: e.entityType,
      entityId: e.entityId,
      action: readStringField(e.payload, 'action'),
      reason: readStringField(e.payload, 'reason'),
    };
  }

  private mapPositionDetail(p: {
    id: string;
    positionNo: number;
    wgr: string;
    supplierColor: string;
    status: string;
    instruction: {
      priceLabelRequired: boolean;
      securityRequired: boolean;
      onlineHandlingRequired: boolean;
    } | null;
    skuLines: Array<{
      id: string;
      ean: string;
      size: string;
      expectedQuantity: number;
      confirmedQuantity: number | null;
      status: string;
    }>;
  }): PositionDetailDto {
    const skuLines: SkuLineDto[] = p.skuLines.map((s) => ({
      id: s.id,
      ean: s.ean,
      size: s.size,
      expectedQuantity: s.expectedQuantity,
      confirmedQuantity: s.confirmedQuantity,
      status: s.status,
    }));
    const expectedQuantity = skuLines.reduce((sum, s) => sum + s.expectedQuantity, 0);
    const confirmed = skuLines.filter((s) => s.confirmedQuantity !== null);
    const confirmedQuantity =
      confirmed.length > 0
        ? confirmed.reduce((sum, s) => sum + (s.confirmedQuantity ?? 0), 0)
        : null;
    return {
      id: p.id,
      positionNo: p.positionNo,
      wgr: p.wgr,
      supplierColor: p.supplierColor,
      expectedQuantity,
      confirmedQuantity,
      priceLabelRequired: p.instruction?.priceLabelRequired ?? false,
      securityRequired: p.instruction?.securityRequired ?? false,
      onlineHandlingRequired: p.instruction?.onlineHandlingRequired ?? false,
      status: p.status,
      skuLines,
    };
  }
}
