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
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';

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

async function seed(): Promise<void> {
  const e1 = await prisma.user.create({ data: { employeeNo: 'ma-101', displayName: 'Anna' } });
  const e2 = await prisma.user.create({ data: { employeeNo: 'ma-102', displayName: 'Bernd' } });
  await prisma.user.create({ data: { employeeNo: 'tl-001', displayName: 'TL' } });

  const loc = await prisma.location.create({
    data: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });

  for (const [emp, net] of [
    [e1, 480],
    [e2, 300],
  ] as const) {
    await prisma.shift.create({
      data: {
        employeeId: emp.id,
        date: asDate(DATE),
        plannedStart: new Date(`${DATE}T07:00:00.000Z`),
        plannedEnd: new Date(`${DATE}T15:00:00.000Z`),
        plannedHours: net / 60,
        netCapacityMinutes: net,
      },
    });
  }

  for (let i = 0; i < 6; i++) {
    await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'board-set-1',
        weBelegNo: `WE-BOARD-${i}`,
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
  await assignment.recalculate(teamlead, DATE);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('board (§10.3 GET /api/teamlead/board)', () => {
  it('groups assigned bundles per employee with cases + route stops', async () => {
    const board = await teamleadSvc.board(DATE);

    expect(board.date).toBe(DATE);
    expect(board.rows.length).toBe(2); // one bundle per employee with a shift
    expect(board.reserveMinutes).toBeGreaterThanOrEqual(0);

    for (const row of board.rows) {
      expect(row.employeeNo).toBeTruthy();
      expect(row.employeeName).toBeTruthy();
      expect(row.bundleId).toBeTruthy();
      expect(row.cases.length).toBeGreaterThan(0);
      expect(row.routeStops.length).toBeGreaterThan(0);
      expect(row.capacityMinutes).toBeGreaterThan(0);
      const firstCase = row.cases[0]!;
      expect(firstCase.weBelegNo).toMatch(/^WE-BOARD-/);
      const firstStop = row.routeStops[0]!;
      expect(firstStop.locationCode).toBe('R27');
      expect(typeof firstStop.scanned).toBe('boolean');
    }

    // reserveMinutes = Σ capacity − Σ planned
    const totalCap = board.rows.reduce((s, r) => s + r.capacityMinutes, 0);
    const totalPlanned = board.rows.reduce((s, r) => s + r.plannedEffortMinutes, 0);
    expect(board.reserveMinutes).toBe(totalCap - totalPlanned);
  });
});
