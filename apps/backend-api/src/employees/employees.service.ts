import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  employeeRoleSchema,
  weeklyPatternSchema,
  type EmployeeRole,
  type WeeklyDayPlan,
  type WeeklyPattern,
} from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import type { Principal } from '../auth/rbac.js';
import type {
  EmployeeDetailDto,
  EmployeeListItemDto,
  EmployeeListResponseDto,
  EmployeeProfileUpdateDto,
  TodayShiftDto,
} from './employees.dto.js';

/** Fraction of net capacity counted as "morning" for the starter-package view (§4.3). */
const MORNING_FRACTION = 0.5;
const AUDIT_LIMIT = 8;
/** getUTCDay() index (0=Sun) → weekly-pattern key. */
const WEEKDAY_KEYS: (keyof WeeklyPattern)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type PrismaTx = Prisma.TransactionClient;

interface UserWithRelations {
  id: string;
  employeeNo: string;
  displayName: string;
  active: boolean;
  bereiche: string[];
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
}

const USER_INCLUDE = { roles: { include: { role: true } } } as const;

/**
 * Mitarbeiter-Einstellungen service (concept employee-settings-ux). Clean separation:
 *   - Stammdaten (who): role, active, bereiche, productivity, overtime tolerance.
 *   - Wochenplan (when): the weekly pattern is the single source of capacity. Saving
 *     it MATERIALIZES the concrete Shift the assignment engine reads — there is no
 *     hand-edited per-day shift. Absences zero the materialized capacity.
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
    if (dto.bereiche !== undefined) data.bereiche = dto.bereiche;
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
      // Any change to capacity inputs re-derives today's concrete shift so the
      // engine immediately reflects the plan (concept: Wochenplan drives capacity).
      await this.materializeShift(tx, id, date);
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

  // --- internals ------------------------------------------------------------

  /**
   * Derive the concrete Shift for `date` from the employee's weekly pattern and
   * persist it (source='pattern'). A non-working day or an inactive employee yields
   * zero capacity. This is the one bridge from the planned Wochenplan to the
   * capacity the engine consumes.
   */
  private async materializeShift(tx: PrismaTx, employeeId: string, date: string): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: employeeId },
      select: { active: true, productivityFactor: true, weeklyPattern: true },
    });
    if (!user) return;
    const day = parseDate(date);

    const pattern = weeklyPatternSchema.safeParse(user.weeklyPattern);
    const plan: WeeklyDayPlan | undefined = pattern.success
      ? pattern.data[WEEKDAY_KEYS[day.getUTCDay()]!]
      : undefined;
    const working = user.active && !!plan?.working && !!plan.start && !!plan.end;

    if (!working || !plan?.start || !plan.end) {
      // No capacity this day: drop any materialized shift so the engine sees nothing.
      await tx.shift.deleteMany({ where: { employeeId, date: day } });
      return;
    }

    const startMin = hhmmToMinutes(plan.start);
    const endMin = hhmmToMinutes(plan.end);
    const net = deriveNetCapacity(
      startMin,
      endMin,
      plan.breakMinutes,
      user.productivityFactor,
      plan.partTimePct,
    );
    const plannedHours = round2(Math.max(0, endMin - startMin) / 60);
    const shiftData = {
      plannedStart: new Date(`${date}T${plan.start}:00`),
      plannedEnd: new Date(`${date}T${plan.end}:00`),
      breakMinutes: plan.breakMinutes,
      plannedHours,
      netCapacityMinutes: net,
      active: net > 0,
      source: 'pattern' as const,
      productivityFactor: user.productivityFactor,
    };
    await tx.shift.upsert({
      where: { shift_employee_date: { employeeId, date: day } },
      create: { employeeId, date: day, ...shiftData },
      update: shiftData,
    });
  }

  private async loadDetail(id: string, date: string): Promise<EmployeeDetailDto> {
    const day = parseDate(date);
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        ...USER_INCLUDE,
        shifts: { where: { date: day } },
      },
    });
    if (!user) throw new NotFoundException(`Employee ${id} not found`);

    const events = await this.prisma.workflowEvent.findMany({
      where: { entityType: 'User', entityId: id },
      orderBy: { seq: 'desc' },
      take: AUDIT_LIMIT,
    });

    const base = this.toListItem(user as unknown as UserWithRelations, date);
    return {
      ...base,
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
      u.active && shift && shift.active ? shift.netCapacityMinutes : 0;
    return {
      id: u.id,
      employeeNo: u.employeeNo,
      displayName: u.displayName,
      roles: u.roles.map((r) => normalizeRole(r.role.name)),
      active: u.active,
      bereiche: u.bereiche,
      productivityFactor: u.productivityFactor,
      overtimeTolerancePct: u.overtimeTolerancePct,
      todayShift,
      netCapacityToday,
      weeklyPattern: parseWeeklyPattern(u.weeklyPattern),
    };
  }
}

function parseWeeklyPattern(value: Prisma.JsonValue): WeeklyPattern | null {
  const parsed = weeklyPatternSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// --- pure helpers -----------------------------------------------------------

function normalizeRole(name: string): EmployeeRole {
  const parsed = employeeRoleSchema.safeParse(name.trim().toLowerCase());
  return parsed.success ? parsed.data : 'employee';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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
