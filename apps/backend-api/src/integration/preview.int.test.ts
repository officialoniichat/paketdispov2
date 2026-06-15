import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * §E.4 assignment PREVIEW (Simulation/Vorschau) against a REAL Postgres
 * (Testcontainers). preview() must run the SAME engine as recalculate() and
 * return a RecalculateResultDto-shaped plan, but write NOTHING: no bundles, no
 * items, no route stops, no events, and no case status changes.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const teamlead: Principal = {
  sub: 'oidc-tl-1',
  employeeNo: 'T1',
  roles: [Role.Teamlead],
  claims: {},
};

function todayMidnightUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let events: EventLogService;
let assignment: AssignmentService;

async function seedReadyPool(): Promise<string[]> {
  const emp = await prisma.user.create({
    data: { employeeNo: 'E100', displayName: 'Anna Beispiel' },
  });
  const loc = await prisma.location.create({
    data: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });
  const day = todayMidnightUtc();
  await prisma.shift.create({
    data: {
      employeeId: emp.id,
      date: day,
      plannedStart: new Date(`${day.toISOString().slice(0, 10)}T06:00:00.000Z`),
      plannedEnd: new Date(`${day.toISOString().slice(0, 10)}T14:00:00.000Z`),
      plannedHours: 8,
      netCapacityMinutes: 600,
    },
  });
  const docSet = await prisma.documentSet.create({
    data: { source: 'pdf_folder', importKey: 'itest-preview-1', status: 'parsed' },
  });
  const caseIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await prisma.goodsReceiptCase.create({
      data: {
        documentSetId: docSet.id,
        weBelegNo: `WE-PV-${i}`,
        bookingDate: day,
        branchNo: '1',
        storageLocationId: loc.id,
        section: 7,
        totalQuantity: 20,
        status: 'ready',
        effortPoints: 10,
        estimatedMinutes: 20,
      },
    });
    caseIds.push(c.id);
  }
  return caseIds;
}

async function counts(): Promise<Record<string, number>> {
  const [bundles, items, stops, evts, ready, assigned] = await Promise.all([
    prisma.assignmentBundle.count(),
    prisma.assignmentItem.count(),
    prisma.routeStop.count(),
    prisma.workflowEvent.count(),
    prisma.goodsReceiptCase.count({ where: { status: 'ready' } }),
    prisma.goodsReceiptCase.count({ where: { status: 'assigned' } }),
  ]);
  return { bundles, items, stops, evts, ready, assigned };
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
  events = new EventLogService(p);
  assignment = new AssignmentService(p, events);
  await seedReadyPool();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('§E.4 assignment preview (no-persist)', () => {
  it('returns a proposed plan without writing anything', async () => {
    const before = await counts();

    const plan = await assignment.preview(teamlead);

    // Plan is the RecalculateResultDto shape and proposes real assignments.
    expect(plan.date).toBe(todayMidnightUtc().toISOString().slice(0, 10));
    expect(plan.bundleCount).toBeGreaterThanOrEqual(1);
    expect(plan.assignedCaseCount).toBe(3);
    expect(plan.durationMs).toBeLessThan(5_000);
    expect(Array.isArray(plan.loads)).toBe(true);

    // Nothing persisted: every row count and the pool composition are unchanged.
    const after = await counts();
    expect(after).toEqual(before);
    expect(after.bundles).toBe(0);
    expect(after.evts).toBe(0);
    expect(after.assigned).toBe(0);
    expect(after.ready).toBe(3);
  });

  it('is repeatable and identical (deterministic, still no writes)', async () => {
    const before = await counts();
    const a = await assignment.preview(teamlead);
    const b = await assignment.preview(teamlead);
    expect(a.bundleCount).toBe(b.bundleCount);
    expect(a.assignedCaseCount).toBe(b.assignedCaseCount);
    expect(await counts()).toEqual(before);
  });
});
