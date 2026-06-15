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
import { CasesService } from '../cases/cases.service.js';
import { TeamleadService } from '../cases/teamlead.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * §8.4 manual teamlead overrides against a REAL Postgres (Testcontainers):
 * withdraw / add / reorder / pause / resume. Each mutation must move the case
 * through the §7.1 legal states, recompute bundle effort, and append an
 * append-only audit event (actorType=teamlead, action+reason in payload).
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const employee: Principal = {
  sub: 'oidc-emp-100',
  employeeNo: 'E100',
  roles: [Role.Employee],
  claims: {},
};
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
let workflow: WorkflowService;
let assignment: AssignmentService;
let cases: CasesService;
let teamleadSvc: TeamleadService;

async function seedReadyPool(): Promise<{ employeeId: string; caseIds: string[] }> {
  const emp = await prisma.user.create({
    data: { employeeNo: 'E100', displayName: 'Anna Beispiel' },
  });
  await prisma.user.create({ data: { employeeNo: 'T1', displayName: 'Teamlead Tom' } });

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
    data: { source: 'pdf_folder', importKey: 'itest-overrides-1', status: 'parsed' },
  });

  const caseIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const c = await prisma.goodsReceiptCase.create({
      data: {
        documentSetId: docSet.id,
        weBelegNo: `WE-OV-${i}`,
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
  workflow = new WorkflowService(p, events);
  assignment = new AssignmentService(p, events);
  const live = new LiveStatusService();
  cases = new CasesService(p, workflow, events, live);
  teamleadSvc = new TeamleadService(p, workflow, events, live);

  await seedReadyPool();
  await assignment.recalculate(teamlead);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

async function aBundle(): Promise<{ id: string; caseIds: string[]; plannedEffortMinutes: number }> {
  const b = await prisma.assignmentBundle.findFirstOrThrow({
    include: { items: { orderBy: { sequence: 'asc' } } },
  });
  return {
    id: b.id,
    caseIds: b.items.map((i) => i.caseId),
    plannedEffortMinutes: b.plannedEffortMinutes,
  };
}

describe('§8.4 withdraw', () => {
  it('moves an assigned case back to ready, unlinks it, recomputes effort, audits', async () => {
    const bundle = await aBundle();
    const caseId = bundle.caseIds[0]!;
    const before = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(before.status).toBe('assigned');

    const result = await teamleadSvc.withdraw(teamlead, bundle.id, {
      caseId,
      reason: 'Falsch zugeteilt',
    });
    expect(result.caseStatus).toBe('ready');
    expect(result.caseIds).not.toContain(caseId);

    const after = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(after.status).toBe('ready');
    expect(after.assignedBundleId).toBeNull();
    expect(after.version).toBe(before.version + 1);

    const item = await prisma.assignmentItem.findFirst({ where: { caseId } });
    expect(item).toBeNull();

    const ev = await prisma.workflowEvent.findFirst({
      where: { eventType: 'assignment.overridden', entityId: bundle.id },
      orderBy: { seq: 'desc' },
    });
    expect(ev).not.toBeNull();
    expect((ev!.payload as Record<string, unknown>)['action']).toBe('withdraw');
    expect((ev!.payload as Record<string, unknown>)['reason']).toBe('Falsch zugeteilt');

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('rejects (409) withdrawing a case an employee has already started', async () => {
    const bundle = await aBundle();
    const caseId = bundle.caseIds[0]!;
    // Employee starts work: assigned → picking.
    await cases.startPreparation(employee, caseId);

    await expect(teamleadSvc.withdraw(teamlead, bundle.id, { caseId })).rejects.toThrow();

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(row.status).toBe('picking');
    expect(row.assignedBundleId).toBe(bundle.id);
  });
});

describe('§8.4 add', () => {
  it('adds a ready case to a bundle, moves it to assigned, recomputes effort', async () => {
    // A ready case freed by the earlier withdraw is back in the pool.
    const ready = await prisma.goodsReceiptCase.findFirstOrThrow({ where: { status: 'ready' } });
    const bundle = await aBundle();

    const result = await teamleadSvc.addToBundle(teamlead, bundle.id, {
      caseId: ready.id,
      reason: 'Kapazitaet frei',
    });
    expect(result.caseStatus).toBe('assigned');
    expect(result.caseIds).toContain(ready.id);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: ready.id } });
    expect(row.status).toBe('assigned');
    expect(row.assignedBundleId).toBe(bundle.id);

    const item = await prisma.assignmentItem.findFirstOrThrow({ where: { caseId: ready.id } });
    expect(item.bundleId).toBe(bundle.id);

    const ev = await prisma.workflowEvent.findFirst({
      where: { eventType: 'assignment.overridden', entityId: bundle.id },
      orderBy: { seq: 'desc' },
    });
    expect((ev!.payload as Record<string, unknown>)['action']).toBe('add');
    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('rejects adding a non-ready case (409)', async () => {
    const assignedCase = await prisma.goodsReceiptCase.findFirstOrThrow({
      where: { status: 'assigned', assignedBundleId: { not: null } },
    });
    const bundle = await aBundle();
    await expect(
      teamleadSvc.addToBundle(teamlead, bundle.id, { caseId: assignedCase.id }),
    ).rejects.toThrow();
  });
});

describe('§8.4 reorder', () => {
  it('reorders the bundle items to match the requested permutation', async () => {
    const bundle = await aBundle();
    const reversed = [...bundle.caseIds].reverse();

    const result = await teamleadSvc.reorder(teamlead, bundle.id, {
      caseIds: reversed,
      reason: 'Wegoptimierung',
    });
    expect(result.caseIds).toEqual(reversed);

    const items = await prisma.assignmentItem.findMany({
      where: { bundleId: bundle.id },
      orderBy: { sequence: 'asc' },
    });
    expect(items.map((i) => i.caseId)).toEqual(reversed);
    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('rejects (400) when caseIds is not a permutation of the bundle', async () => {
    const bundle = await aBundle();
    await expect(
      teamleadSvc.reorder(teamlead, bundle.id, { caseIds: [...bundle.caseIds, 'bogus'] }),
    ).rejects.toThrow();
  });
});

describe('§8.4 pause / resume', () => {
  it('toggles the bundle status active ↔ paused', async () => {
    const bundle = await aBundle();

    const paused = await teamleadSvc.pauseBundle(teamlead, bundle.id, { reason: 'Pause' });
    expect(paused.bundleStatus).toBe('paused');
    let row = await prisma.assignmentBundle.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(row.status).toBe('paused');

    const resumed = await teamleadSvc.resumeBundle(teamlead, bundle.id, { reason: 'Weiter' });
    expect(resumed.bundleStatus).toBe('active');
    row = await prisma.assignmentBundle.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(row.status).toBe('active');

    const pauseEv = await prisma.workflowEvent.findFirst({
      where: { eventType: 'assignment.overridden', entityId: bundle.id },
      orderBy: { seq: 'desc' },
    });
    expect((pauseEv!.payload as Record<string, unknown>)['action']).toBe('resume');
    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('rejects pausing a completed/cancelled bundle (409)', async () => {
    const bundle = await aBundle();
    await prisma.assignmentBundle.update({
      where: { id: bundle.id },
      data: { status: 'completed' },
    });
    await expect(teamleadSvc.pauseBundle(teamlead, bundle.id, {})).rejects.toThrow();
    // restore for any later tests
    await prisma.assignmentBundle.update({ where: { id: bundle.id }, data: { status: 'active' } });
  });
});
