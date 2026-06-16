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
 * Integration test for GET /api/teamlead/capacity (Task 1.2). Mirrors the
 * buildCockpitSummary capacity math from teamlead-web selectors for parity.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';

const teamlead: Principal = { sub: 'oidc-tl-1', employeeNo: 'tl-001', roles: [Role.Teamlead], claims: {} };

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
  const docSet = await prisma.documentSet.create({
    data: { source: 'pdf_folder', importKey: 'cap-set-1', status: 'parsed' },
  });
  for (let i = 0; i < 5; i++) {
    await prisma.goodsReceiptCase.create({
      data: {
        documentSetId: docSet.id,
        weBelegNo: `WE-CAP-${i}`,
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

describe('capacity (§10.1 GET /api/teamlead/capacity)', () => {
  it('computes net/planned/reserve/utilisation for the date', async () => {
    const cap = await teamleadSvc.capacity(DATE);

    expect(cap.date).toBe(DATE);
    expect(cap.plannedEmployees).toBe(2);
    expect(cap.netCapacityMinutes).toBe(780); // 480 + 300
    expect(cap.plannedMinutes).toBeGreaterThan(0);
    expect(cap.reserveMinutes).toBe(cap.netCapacityMinutes - cap.plannedMinutes);
    expect(cap.utilisationPct).toBe(
      Math.round((cap.plannedMinutes / cap.netCapacityMinutes) * 1000) / 10,
    );
  });
});
