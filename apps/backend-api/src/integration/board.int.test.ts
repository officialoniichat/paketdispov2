import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { TeamleadReadService } from '../cases/teamlead-read.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * Integration test for GET /api/teamlead/board (Task 1.1). Seeds two employees
 * with shifts + a ready pool, runs the engine (recalculate), then asserts the
 * board groups assigned bundles per employee with member cases + route stops.
 * A THIRD employee gets a shift only AFTER planning, so she is scheduled but
 * holds no bundle — the board must still render her as an idle row.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';
/** employeeNo of the scheduled-but-idle worker added after recalculate. */
const IDLE_EMPLOYEE_NO = 'ma-103';

const teamlead: Principal = {
  sub: 'oidc-tl-1',
  employeeNo: 'tl-001',
  roles: [Role.Teamlead],
  claims: {},
};

function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let assignment: AssignmentService;
let teamleadSvc: TeamleadReadService;

/** All-days-working pattern so DATE is a working day and recalculate's
 * materialization keeps the planned employees' capacity (Wochenplan drives capacity). */
const FULL_DAY = { working: true, start: '07:00', end: '15:00', breakMinutes: 0, partTimePct: 100 };
const WEEK_PATTERN = {
  mon: FULL_DAY,
  tue: FULL_DAY,
  wed: FULL_DAY,
  thu: FULL_DAY,
  fri: FULL_DAY,
  sat: FULL_DAY,
  sun: FULL_DAY,
};

async function seed(): Promise<void> {
  // Two planned employees with a weekly pattern: recalculate materializes their
  // concrete shift (≈480 net) and the engine distributes the pool across them.
  await prisma.user.create({
    data: { employeeNo: 'ma-101', displayName: 'Anna', weeklyPattern: WEEK_PATTERN },
  });
  await prisma.user.create({
    data: { employeeNo: 'ma-102', displayName: 'Bernd', weeklyPattern: WEEK_PATTERN },
  });
  await prisma.user.create({ data: { employeeNo: 'tl-001', displayName: 'TL' } });

  const loc = await prisma.location.create({
    data: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });

  for (let i = 0; i < 6; i++) {
    await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'board-set-1',
        // Non-consecutive numbers (gap 100 > maxWeBelegGap): six INDEPENDENT Belege —
        // a consecutive run would form a T3 "suspected" Liefergruppe and be withheld
        // from auto-distribution (Pool-Hold D2), leaving the board empty.
        weBelegNo: `WE-BOARD-${i * 100}`,
        bookingDate: asDate(DATE),
        branchNo: '1',
        storageLocationId: loc.id,
        section: 7,
        totalQuantity: 20,
        status: 'ready',
        effortPoints: 8,
        estimatedMinutes: 20,
      },
    });
  }
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  const p = prisma as unknown as PrismaService;
  const events = new EventLogService(p);
  assignment = new AssignmentService(p, events);
  teamleadSvc = new TeamleadReadService(p);
  await seed();
  await assignment.recalculate(teamlead, DATE, new Date(`${DATE}T07:00:00.000Z`));
  // Schedule a third worker AFTER planning: she has an active shift (capacity) but
  // the engine never gave her a bundle — exactly the "free head" the board must show.
  const idle = await prisma.user.create({
    data: { employeeNo: IDLE_EMPLOYEE_NO, displayName: 'Clara', bereiche: ['regal'] },
  });
  await prisma.shift.create({
    data: {
      employeeId: idle.id,
      date: asDate(DATE),
      plannedStart: new Date(`${DATE}T07:00:00.000Z`),
      plannedEnd: new Date(`${DATE}T15:00:00.000Z`),
      plannedHours: 8,
      netCapacityMinutes: 480,
    },
  });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('board (§10.3 GET /api/teamlead/board)', () => {
  it('groups assigned bundles per employee with cases + route stops', async () => {
    const board = await teamleadSvc.board(DATE);

    expect(board.date).toBe(DATE);
    // Three scheduled employees in total (two planned + one idle).
    expect(board.rows.length).toBe(3);
    expect(board.freeCapacityMinutes).toBeGreaterThanOrEqual(0);

    const assigned = board.rows.filter((r) => r.bundleId !== null);
    expect(assigned.length).toBeGreaterThanOrEqual(1); // the engine placed the pool

    for (const row of assigned) {
      expect(row.employeeNo).toBeTruthy();
      expect(row.employeeName).toBeTruthy();
      expect(row.bundleId).toBeTruthy();
      expect(row.cases.length).toBeGreaterThan(0);
      expect(row.routeStops.length).toBeGreaterThan(0);
      expect(row.capacityMinutes).toBeGreaterThan(0);
      // B3 Teile-first: plannedTeile = Σ totalQuantity over the row's cases.
      expect(row.plannedTeile).toBe(row.cases.reduce((s, c) => s + c.totalQuantity, 0));
      expect(row.plannedTeile).toBeGreaterThan(0);
      // B5: skill tier is projected from the User (seed default: profi).
      expect(row.skillTier).toBe('profi');
      const firstStop = row.routeStops[0]!;
      expect(firstStop.locationCode).toBe('R27');
      expect(typeof firstStop.scanned).toBe('boolean');
    }

    // All six pool Belege ended up on the board's assigned rows.
    const placed = assigned.flatMap((r) => r.cases.map((c) => c.weBelegNo)).sort();
    expect(placed).toEqual(['WE-BOARD-0', 'WE-BOARD-100', 'WE-BOARD-200', 'WE-BOARD-300', 'WE-BOARD-400', 'WE-BOARD-500']);

    // freeCapacityMinutes = Σ capacity − Σ planned (across ALL rows, idle included)
    const totalCap = board.rows.reduce((s, r) => s + r.capacityMinutes, 0);
    const totalPlanned = board.rows.reduce((s, r) => s + r.plannedEffortMinutes, 0);
    expect(board.freeCapacityMinutes).toBe(totalCap - totalPlanned);
  });

  it('renders a scheduled-but-unassigned employee as an idle row', async () => {
    const board = await teamleadSvc.board(DATE);

    const idle = board.rows.find((r) => r.employeeNo === IDLE_EMPLOYEE_NO);
    expect(idle).toBeDefined();
    expect(idle!.employeeName).toBe('Clara');
    // Free head: no bundle, no Bündel, but capacity + Bereiche are visible.
    expect(idle!.bundleId).toBeNull();
    expect(idle!.bundleStatus).toBe('idle');
    expect(idle!.cases).toEqual([]);
    expect(idle!.routeStops).toEqual([]);
    expect(idle!.plannedEffortMinutes).toBe(0);
    expect(idle!.plannedTeile).toBe(0);
    expect(idle!.skillTier).toBe('profi');
    expect(idle!.capacityMinutes).toBe(480);
    expect(idle!.bereiche).toEqual(['regal']);
  });

  it('orders rows deterministically by name', async () => {
    const board = await teamleadSvc.board(DATE);
    const names = board.rows.map((r) => r.employeeName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
