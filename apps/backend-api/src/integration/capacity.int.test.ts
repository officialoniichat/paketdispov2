import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { AdminService } from '../admin/admin.service.js';
import { TeamleadReadService } from '../cases/teamlead-read.service.js';
import type { CapacityDto } from '../cases/cases.dto.js';
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
/** Capacity snapshot taken seed-only (before recalculate drains the ready pool). */
let preRecalcCapacity: CapacityDto;

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
  const e3 = await prisma.user.create({ data: { employeeNo: 'ma-103', displayName: 'Cara' } });
  await prisma.shift.create({
    data: {
      employeeId: e3.id,
      date: asDate(DATE),
      plannedStart: new Date(`${DATE}T07:00:00.000Z`),
      plannedEnd: new Date(`${DATE}T15:00:00.000Z`),
      plannedHours: 8,
      netCapacityMinutes: 480,
    },
  });
  const docSet = await prisma.documentSet.create({
    data: { source: 'pdf_folder', importKey: 'cap-set-1', status: 'parsed' },
  });
  // 14 ready, holdable (section 1, far-out Verladetag) carryover cases. With 3 active
  // shifts the eiserne Reserve target is 3 × 105 = 315 min; 14 × 30 = 420 min of
  // holdable backlog comfortably secures it (concept §5/§6).
  for (let i = 0; i < 14; i++) {
    await prisma.goodsReceiptCase.create({
      data: {
        documentSetId: docSet.id,
        weBelegNo: `WE-CAP-${i}`,
        bookingDate: asDate(DATE),
        loadPlanDate: asDate('2026-06-30'),
        branchNo: '1',
        storageLocationId: loc.id,
        section: 1,
        totalQuantity: 20,
        status: 'ready',
        effortPoints: 12,
        estimatedMinutes: 30,
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
  // No rule_config row is seeded → AdminService.getRuleConfig() returns the default
  // reserve rule (enabled, today_proxy, morningGapMinutes 105), which drives the
  // eiserne Reserve exactly as the Admin/Regeln form would.
  teamleadSvc = new TeamleadReadService(p, new AdminService(p));
  await seed();
  // Seed-only snapshot: 14 ready cases still in the pool, so the eiserne Reserve is
  // secured. Capture it BEFORE recalculate assigns the pool (which empties `ready`).
  preRecalcCapacity = await teamleadSvc.capacity(DATE);
  await assignment.recalculate(teamlead, DATE);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('capacity (§10.1 GET /api/teamlead/capacity)', () => {
  it('computes net/planned/freie-Kapazität/utilisation for the date', async () => {
    const cap = await teamleadSvc.capacity(DATE);

    expect(cap.date).toBe(DATE);
    expect(cap.plannedEmployees).toBe(3);
    expect(cap.netCapacityMinutes).toBe(1260); // 480 + 300 + 480
    expect(cap.plannedMinutes).toBeGreaterThan(0);
    // Freie Kapazität (idle headroom) math is unchanged by the reserve work.
    expect(cap.reserveMinutes).toBe(cap.netCapacityMinutes - cap.plannedMinutes);
    expect(cap.utilisationPct).toBe(
      Math.round((cap.plannedMinutes / cap.netCapacityMinutes) * 1000) / 10,
    );
  });

  it('exposes the eiserne Reserve + Starterpaket fields, satisfied from the seed pool', () => {
    // today_proxy: 3 active shifts × 105 morningGapMinutes = 315 target.
    expect(preRecalcCapacity.reserveTargetMinutes).toBe(315);
    // 14 holdable ready cases × 30 min = 420 raw eligible backlog.
    expect(preRecalcCapacity.reserveSecuredMinutes).toBe(420);
    expect(preRecalcCapacity.reserveState).toBe('satisfied');
    // Starter caps at the target worth: ceil(315 / 30) = 11 belege (330 min ≥ 315).
    expect(preRecalcCapacity.starterBelegCount).toBe(11);
    expect(preRecalcCapacity.starterMinutes).toBe(330);
  });

  it('drops the reserve to at_risk once recalculate has drained the ready pool', async () => {
    // After a full recalculate the ready pool is assigned away → nothing left to hold.
    const cap = await teamleadSvc.capacity(DATE);
    expect(cap.reserveSecuredMinutes).toBe(0);
    expect(cap.reserveState).toBe('at_risk');
    expect(cap.starterBelegCount).toBe(0);
  });
});
