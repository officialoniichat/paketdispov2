import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { LiveStatusService } from '../live/live.module.js';
import { TeamleadService } from '../cases/teamlead.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * Integration test for GET /api/teamlead/events (Task 1.4). Reads the
 * append-only WorkflowEvent log (seq desc), filters by actorType/entityId,
 * projects action/reason out of the payload JSON.
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
let teamleadSvc: TeamleadService;

async function seed(): Promise<void> {
  const emp = await prisma.user.create({ data: { employeeNo: 'ma-101', displayName: 'Anna' } });
  const loc = await prisma.location.create({
    data: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });
  await prisma.shift.create({
    data: {
      employeeId: emp.id,
      date: asDate(DATE),
      plannedStart: new Date(`${DATE}T07:00:00.000Z`),
      plannedEnd: new Date(`${DATE}T15:00:00.000Z`),
      plannedHours: 8,
      netCapacityMinutes: 480,
    },
  });
  const docSet = await prisma.documentSet.create({
    data: { source: 'pdf_folder', importKey: 'ev-set-1', status: 'parsed' },
  });
  for (let i = 0; i < 3; i++) {
    await prisma.goodsReceiptCase.create({
      data: {
        documentSetId: docSet.id,
        weBelegNo: `WE-EV-${i}`,
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
  const workflow = new WorkflowService(p, events);
  assignment = new AssignmentService(p, events);
  const live = new LiveStatusService();
  teamleadSvc = new TeamleadService(p, workflow, events, live);
  await seed();
  await assignment.recalculate(teamlead, DATE); // appends bundle.created + bundle.assigned
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('events (§7.2/§16.2 GET /api/teamlead/events)', () => {
  it('returns events newest-first with seq + projected fields', async () => {
    const rows = await teamleadSvc.auditEvents({ limit: 10 });

    expect(rows.length).toBeGreaterThan(0);
    // seq desc (monotonic, newest first)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.seq).toBeGreaterThan(rows[i]!.seq);
    }
    const first = rows[0]!;
    expect(typeof first.seq).toBe('number');
    expect(typeof first.at).toBe('string');
    expect(first.eventType).toBeTruthy();
    expect(first.entityType).toBeTruthy();
    expect(rows.some((r) => r.eventType === 'bundle.assigned')).toBe(true);
  });

  it('filters by actorType', async () => {
    const tl = await teamleadSvc.auditEvents({ actorType: 'teamlead', limit: 50 });
    expect(tl.length).toBeGreaterThan(0);
    expect(tl.every((r) => r.actorType === 'teamlead')).toBe(true);
  });

  it('honours the limit (default 50, capped)', async () => {
    const one = await teamleadSvc.auditEvents({ limit: 1 });
    expect(one.length).toBe(1);
  });
});
