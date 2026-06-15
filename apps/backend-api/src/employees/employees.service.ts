import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AbsenceKind } from '@prisma/client';
import {
  absenceKindSchema,
  employeeRoleSchema,
  weeklyPatternSchema,
  type EmployeeRole,
} from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import type { Principal } from '../auth/rbac.js';
import type {
  AbsenceCreateDto,
  EmployeeDetailDto,
  EmployeeListItemDto,
  EmployeeListResponseDto,
  EmployeeProfileUpdateDto,
  ShiftOverrideDto,
  TodayShiftDto,
} from './employees.dto.js';

/** Fraction of net capacity counted as "morning" for the starter-package view (§4.3). */
const MORNING_FRACTION = 0.5;
const AUDIT_LIMIT = 8;

type PrismaTx = Prisma.TransactionClient;

interface UserWithRelations {
  id: string;
  employeeNo: string;
  displayName: string;
  active: boolean;
  isPilot: boolean;
  areaTags: string[];
  productivityFactor: number;
  overtimeTolerancePct: number;
  weeklyPattern: Prisma.JsonValue;
  roles: { role: { name: string } }[];
  shifts: {
    date: Date;
    plannedStart: Date;
    plannedEnd: Date;
    breakMinutes: number;
    netCapacityMinutes: number;
    source: string;
    active: boolean;
  }[];
  absences: { id: string }[];
}

const USER_INCLUDE = {
  roles: { include: { role: true } },
} as const;

/**
 * Mitarbeiter-Einstellungen service (concept employee-settings-ux). The single
 * editable + audited source for the engine's capacity inputs: profile (wer),
 * shift/weekly pattern (wann/wie lange), absence (Verfügbarkeit). Writes the same
 * `Shift.netCapacityMinutes`/`active` the assignment engine already reads, so no
 * new engine path is introduced.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventLogService,
  ) {}

  // --- Read -----------------------------------------------------------------

  async list(dateStr?: string): Promise<EmployeeListResponseDto> {
    const date = dateStr ?? todayIso();
    const day = parseDate(date);
    const users = await this.prisma.user.findMany({
      include: {
        ...USER_INCLUDE,
        shifts: { where: { date: day } },
        absences: { where: { dateFrom: { lte: day }, dateTo: { gte: day } } },
      },
      orderBy: { displayName: 'asc' },
    });

    const employees = users.map((u) => this.toListItem(u as unknown as UserWithRelations, date));
    const teamCapacityMinutes = employees.reduce((sum, e) => sum + e.netCapacityToday, 0);
    const activeCount = employees.filter((e) => e.netCapacityToday > 0).length;
    return {
      date,
      activeCount,
      teamCapacityMinutes,
      morningCapacityMinutes: Math.round(teamCapacityMinutes * MORNING_FRACTION),
      employees,
    };
  }

  async get(id: string, dateStr?: string): Promise<EmployeeDetailDto> {
    return this.loadDetail(id, dateStr ?? todayIso());
  }

  // --- Write ----------------------------------------------------------------

  async updateProfile(
    principal: Principal,
    id: string,
    dto: EmployeeProfileUpdateDto,
  ): Promise<EmployeeDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Employee ${id} not found`);

    const data: Prisma.UserUpdateInput = {};
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.isPilot !== undefined) data.isPilot = dto.isPilot;
    if (dto.areaTags !== undefined) data.areaTags = dto.areaTags;
    if (dto.overtimeTolerancePct !== undefined) data.overtimeTolerancePct = dto.overtimeTolerancePct;
    if (dto.productivityFactor !== undefined) data.productivityFactor = dto.productivityFactor;
    if (dto.weeklyPattern !== undefined) {
      if (dto.weeklyPattern === null) {
        data.weeklyPattern = Prisma.JsonNull;
      } else {
        const parsed = weeklyPatternSchema.safeParse(dto.weeklyPattern);
        if (!parsed.success) {
          throw new BadRequestException({
            message: 'Ungültiges Wochenmuster',
            issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          });
        }
        data.weeklyPattern = parsed.data as unknown as Prisma.InputJsonValue;
      }
    }

    const date = todayIso();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      // A new productivity factor re-derives today's shift capacity so the engine
      // immediately sees the maintained per-head value (concept §c/§e).
      if (dto.productivityFactor !== undefined && dto.productivityFactor !== user.productivityFactor) {
        await this.rederiveShiftCapacity(tx, id, parseDate(date), dto.productivityFactor);
      }
      await this.events.append(
        {
          eventType: 'employee.profile_updated',
          entityType: 'User',
          entityId: id,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: { changed: Object.keys(data) },
        },
        tx,
      );
    });

    return this.loadDetail(id, date);
  }

  async overrideShift(
    principal: Principal,
    id: string,
    dto: ShiftOverrideDto,
  ): Promise<EmployeeDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, productivityFactor: true },
    });
    if (!user) throw new NotFoundException(`Employee ${id} not found`);

    const startMin = hhmmToMinutes(dto.plannedStart);
    const endMin = hhmmToMinutes(dto.plannedEnd);
    if (endMin <= startMin) {
      throw new BadRequestException('plannedEnd muss nach plannedStart liegen');
    }
    const partTimePct = dto.partTimePct ?? 100;
    const net = dto.active
      ? deriveNetCapacity(startMin, endMin, dto.breakMinutes, user.productivityFactor, partTimePct)
      : 0;
    const plannedHours = round2(Math.max(0, endMin - startMin) / 60);
    const day = parseDate(dto.date);
    const plannedStart = new Date(`${dto.date}T${dto.plannedStart}:00`);
    const plannedEnd = new Date(`${dto.date}T${dto.plannedEnd}:00`);

    await this.prisma.$transaction(async (tx) => {
      await tx.shift.upsert({
        where: { shift_employee_date: { employeeId: id, date: day } },
        create: {
          employeeId: id,
          date: day,
          plannedStart,
          plannedEnd,
          breakMinutes: dto.breakMinutes,
          plannedHours,
          netCapacityMinutes: net,
          active: dto.active,
          source: 'teamlead',
          productivityFactor: user.productivityFactor,
        },
        update: {
          plannedStart,
          plannedEnd,
          breakMinutes: dto.breakMinutes,
          plannedHours,
          netCapacityMinutes: net,
          active: dto.active,
          source: 'teamlead',
          productivityFactor: user.productivityFactor,
        },
      });
      await this.events.append(
        {
          eventType: 'employee.shift_overridden',
          entityType: 'User',
          entityId: id,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: { date: dto.date, netCapacityMinutes: net, reason: dto.reason ?? null },
        },
        tx,
      );
    });

    return this.loadDetail(id, dto.date);
  }

  async createAbsence(
    principal: Principal,
    id: string,
    dto: AbsenceCreateDto,
  ): Promise<EmployeeDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, productivityFactor: true },
    });
    if (!user) throw new NotFoundException(`Employee ${id} not found`);
    const kind = absenceKindSchema.parse(dto.kind);
    const from = parseDate(dto.dateFrom);
    const to = parseDate(dto.dateTo);
    if (to < from) throw new BadRequestException('dateTo darf nicht vor dateFrom liegen');

    await this.prisma.$transaction(async (tx) => {
      await tx.absence.create({
        data: {
          employeeId: id,
          dateFrom: from,
          dateTo: to,
          kind: kind as AbsenceKind,
          partialUntil: dto.partialUntil ?? null,
          reason: dto.reason ?? null,
          createdBy: principal.sub,
        },
      });
      await this.applyAbsenceToShifts(tx, id, from, to, kind, dto.partialUntil, user.productivityFactor);
      await this.events.append(
        {
          eventType: 'employee.absence_recorded',
          entityType: 'User',
          entityId: id,
          actorType: 'teamlead',
          actorId: principal.sub,
          payload: {
            kind,
            dateFrom: dto.dateFrom,
            dateTo: dto.dateTo,
            reason: dto.reason ?? null,
          },
        },
        tx,
      );
    });

    return this.loadDetail(id, dto.dateFrom);
  }

  // --- internals ------------------------------------------------------------

  /** Zero (full absence) or shorten (teilabwesend) the netCapacity of affected shifts. */
  private async applyAbsenceToShifts(
    tx: PrismaTx,
    employeeId: string,
    from: Date,
    to: Date,
    kind: string,
    partialUntil: string | undefined,
    productivityFactor: number,
  ): Promise<void> {
    const shifts = await tx.shift.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
    });
    for (const shift of shifts) {
      let net = 0;
      if (kind === 'teilabwesend' && partialUntil) {
        const startMin = dateToMinutes(shift.plannedStart);
        const untilMin = hhmmToMinutes(partialUntil);
        net = deriveNetCapacity(startMin, Math.max(startMin, untilMin), shift.breakMinutes, productivityFactor, 100);
      }
      await tx.shift.update({
        where: { id: shift.id },
        data: { netCapacityMinutes: net, active: net > 0 },
      });
    }
  }

  /** Re-derive a single day's shift capacity for a changed per-head productivity. */
  private async rederiveShiftCapacity(
    tx: PrismaTx,
    employeeId: string,
    day: Date,
    productivityFactor: number,
  ): Promise<void> {
    const shift = await tx.shift.findUnique({
      where: { shift_employee_date: { employeeId, date: day } },
    });
    if (!shift || !shift.active) return;
    const startMin = dateToMinutes(shift.plannedStart);
    const endMin = dateToMinutes(shift.plannedEnd);
    const net = deriveNetCapacity(startMin, endMin, shift.breakMinutes, productivityFactor, 100);
    await tx.shift.update({
      where: { id: shift.id },
      data: { netCapacityMinutes: net, productivityFactor },
    });
  }

  private async loadDetail(id: string, date: string): Promise<EmployeeDetailDto> {
    const day = parseDate(date);
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        ...USER_INCLUDE,
        shifts: { where: { date: day } },
        absences: { where: { dateFrom: { lte: day }, dateTo: { gte: day } } },
      },
    });
    if (!user) throw new NotFoundException(`Employee ${id} not found`);

    const events = await this.prisma.workflowEvent.findMany({
      where: { entityType: 'User', entityId: id },
      orderBy: { seq: 'desc' },
      take: AUDIT_LIMIT,
    });

    const base = this.toListItem(user as unknown as UserWithRelations, date);
    const weeklyParsed = weeklyPatternSchema.safeParse(user.weeklyPattern);
    return {
      ...base,
      weeklyPattern: weeklyParsed.success ? weeklyParsed.data : null,
      recentAudit: events.map((e) => ({
        eventType: e.eventType,
        at: e.timestamp.toISOString(),
        actorId: e.actorId ?? null,
        payload: (e.payload as Record<string, unknown>) ?? {},
      })),
    };
  }

  private toListItem(u: UserWithRelations, date: string): EmployeeListItemDto {
    const shift = u.shifts.find((s) => isoDate(s.date) === date) ?? u.shifts[0] ?? null;
    const absentToday = u.absences.length > 0;
    const todayShift: TodayShiftDto | null = shift
      ? {
          date,
          plannedStart: dateToHHMM(shift.plannedStart),
          plannedEnd: dateToHHMM(shift.plannedEnd),
          breakMinutes: shift.breakMinutes,
          netCapacityMinutes: shift.netCapacityMinutes,
          source: shift.source,
          active: shift.active,
        }
      : null;
    const netCapacityToday =
      u.active && shift && shift.active && !absentToday ? shift.netCapacityMinutes : 0;
    return {
      id: u.id,
      employeeNo: u.employeeNo,
      displayName: u.displayName,
      roles: u.roles.map((r) => normalizeRole(r.role.name)),
      active: u.active,
      isPilot: u.isPilot,
      areaTags: u.areaTags,
      productivityFactor: u.productivityFactor,
      overtimeTolerancePct: u.overtimeTolerancePct,
      todayShift,
      absentToday,
      netCapacityToday,
    };
  }
}

// --- pure helpers -----------------------------------------------------------

function normalizeRole(name: string): EmployeeRole {
  const parsed = employeeRoleSchema.safeParse(name.trim().toLowerCase());
  return parsed.success ? parsed.data : 'employee';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A @db.Date value at UTC midnight, so equality/range filters match Prisma's Date. */
function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function dateToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function dateToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** netCapacity = (window − break) × productivity × Teilzeit-Anteil (concept §c). */
function deriveNetCapacity(
  startMin: number,
  endMin: number,
  breakMinutes: number,
  productivityFactor: number,
  partTimePct: number,
): number {
  const net = Math.max(0, endMin - startMin - breakMinutes);
  return Math.round(net * productivityFactor * (partTimePct / 100));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
