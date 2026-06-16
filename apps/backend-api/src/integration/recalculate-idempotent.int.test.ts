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
 * Idempotency guard for the teamlead "Neu berechnen" button (§8.3, Anhang E.5).
 * Running recalculate twice for the SAME date must succeed both times and must
 * not duplicate/leak AssignmentItems despite the @@unique([caseId]) constraint.
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

async function seed(): Promise<{ employeeId: string; caseIds: string[] }> {
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

  const caseIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'recalc-set-1',
        weBelegNo: `WE-RECALC-${i}`,
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
  return { employeeId: emp.id, caseIds };
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
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('recalculate idempotency (§8.3 Neu berechnen)', () => {
  it('runs twice for the same date without P2002 and without duplicating items', async () => {
    const { caseIds } = await seed();

    const first = await assignment.recalculate(teamlead);
    expect(first.bundleCount).toBeGreaterThan(0);
    expect(first.assignedCaseCount).toBe(caseIds.length);

    // SECOND run for the same date must not throw (was P2002 on AssignmentItem.caseId).
    const second = await assignment.recalculate(teamlead);
    expect(second.bundleCount).toBeGreaterThan(0);
    expect(second.assignedCaseCount).toBe(caseIds.length);

    // No leaked/duplicated items: exactly one item per assigned case.
    const itemCount = await prisma.assignmentItem.count();
    expect(itemCount).toBe(second.assignedCaseCount);

    // Prior bundles were cleared, only the latest plan survives.
    const bundleCount = await prisma.assignmentBundle.count();
    expect(bundleCount).toBe(second.bundleCount);

    // All seeded cases are still assigned to a surviving bundle.
    const rows = await prisma.goodsReceiptCase.findMany({ where: { id: { in: caseIds } } });
    expect(rows.every((c) => c.status === 'assigned')).toBe(true);
    expect(rows.every((c) => c.assignedBundleId !== null)).toBe(true);

    // Append-only audit log preserved: events from both runs survive, chain intact.
    const createdEv = await prisma.workflowEvent.count({ where: { eventType: 'bundle.created' } });
    expect(createdEv).toBe(first.bundleCount + second.bundleCount);
    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('leaves in_progress / non-ready cases untouched on recalc', async () => {
    // Mark one already-assigned case as in-flight; recalc must not steal it back.
    const inFlight = await prisma.goodsReceiptCase.findFirstOrThrow({ where: { status: 'assigned' } });
    const keptBundleId = inFlight.assignedBundleId;
    await prisma.goodsReceiptCase.update({
      where: { id: inFlight.id },
      data: { status: 'in_progress' },
    });

    await assignment.recalculate(teamlead);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: inFlight.id } });
    expect(row.status).toBe('in_progress');
    expect(row.assignedBundleId).toBe(keptBundleId);

    // Its bundle/item must survive (not deleted by the cleanup).
    const item = await prisma.assignmentItem.findFirst({ where: { caseId: inFlight.id } });
    expect(item).not.toBeNull();
  });
});
