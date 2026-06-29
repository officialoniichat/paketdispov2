import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { LiveStatusService } from '../live/live.module.js';
import { CasesService } from '../cases/cases.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * §continuation — POST /api/me/next-bundle (Pull-on-idle). The worker pulls a
 * cart-sized bundle from the ready pool; finishing it marks the bundle completed
 * and frees a second pull; an empty pool / active bundle / no shift each return
 * the matching reason. Shifts are derived from the weekly pattern (assignNextBundle
 * materializes them), so the seed sets a working pattern rather than a raw shift.
 */
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const owner: Principal = { sub: 'oidc-emp-1', employeeNo: 'E-1', roles: [Role.Employee], claims: {} };

const WORK_DAY = { working: true, start: '08:00', end: '16:00', breakMinutes: 30, partTimePct: 100 };
const OFF_DAY = { working: false, start: '00:00', end: '00:00', breakMinutes: 0, partTimePct: 0 };
const WORKING_WEEK = {
  sun: WORK_DAY,
  mon: WORK_DAY,
  tue: WORK_DAY,
  wed: WORK_DAY,
  thu: WORK_DAY,
  fri: WORK_DAY,
  sat: WORK_DAY,
};
const OFF_WEEK = {
  sun: OFF_DAY,
  mon: OFF_DAY,
  tue: OFF_DAY,
  wed: OFF_DAY,
  thu: OFF_DAY,
  fri: OFF_DAY,
  sat: OFF_DAY,
};

function today(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

const PULL_NOW = new Date(`${today().toISOString().slice(0, 10)}T09:00:00`);

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let assignment: AssignmentService;
let cases: CasesService;
let employeeId: string;

async function reset(readyCount: number): Promise<void> {
  await prisma.assignmentItem.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.zstRecord.deleteMany();
  await prisma.goodsReceiptCase.deleteMany();
  await prisma.assignmentBundle.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.location.deleteMany();
  await prisma.workflowEvent.deleteMany();
  await prisma.user.deleteMany();

  const day = today();
  const user = await prisma.user.create({
    data: {
      employeeNo: 'E-1',
      displayName: 'Eins',
      bereiche: ['Regal'],
      productivityFactor: 1,
      weeklyPattern: WORKING_WEEK,
    },
  });
  employeeId = user.id;
  const loc = await prisma.location.create({
    data: { code: 'R1', displayName: 'Regal 1', kind: 'regal', sequenceIndex: 1 },
  });
  for (let i = 0; i < readyCount; i += 1) {
    await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: `nb-${i}`,
        weBelegNo: `WE-NB-${i}`,
        bookingDate: day,
        branchNo: '1',
        storageLocationId: loc.id,
        section: 1,
        totalQuantity: 3,
        status: 'ready',
        effortPoints: 5,
        estimatedMinutes: 10,
      },
    });
  }
}

/** Drive the worker's open cart through start → complete so its bundle closes. */
async function finishOwnersOpenCart(): Promise<void> {
  const bundle = await prisma.assignmentBundle.findFirst({
    where: { employeeId, status: { not: 'completed' } },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  if (!bundle) throw new Error('no open bundle to finish');
  for (const item of bundle.items) {
    await cases.startPreparation(owner, item.caseId);
    await cases.complete(owner, item.caseId);
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
  cases = new CasesService(p, new WorkflowService(p, events), events, new LiveStatusService());
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('POST /api/me/next-bundle (Pull-on-idle)', () => {
  it('assigns one cart-sized bundle from the ready pool (≤6, bound to the worker)', async () => {
    await reset(8);
    const res = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(res.assigned).toBe(true);
    expect(res.caseCount).toBe(6); // 8 ready × 10 min, capped at maxCasesPerBundle=6

    expect(await prisma.goodsReceiptCase.count({ where: { status: 'assigned' } })).toBe(6);
    expect(await prisma.goodsReceiptCase.count({ where: { status: 'ready' } })).toBe(2);
  });

  it('refuses a second pull while the first cart is still open', async () => {
    const res = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(res).toMatchObject({ assigned: false, reason: 'active_bundle' });
  });

  it('completes the bundle when its last case is done, then the next pull works', async () => {
    await finishOwnersOpenCart();
    const firstBundle = await prisma.assignmentBundle.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'asc' },
    });
    expect(firstBundle?.status).toBe('completed');

    const next = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(next).toMatchObject({ assigned: true, caseCount: 2 });
  });

  it('returns pool_empty when nothing is free', async () => {
    await finishOwnersOpenCart();
    const res = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(res).toMatchObject({ assigned: false, reason: 'pool_empty' });
  });

  it('returns no_shift when the employee is not working today', async () => {
    await reset(3);
    await prisma.user.update({ where: { id: employeeId }, data: { weeklyPattern: OFF_WEEK } });
    const res = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(res).toMatchObject({ assigned: false, reason: 'no_shift' });
  });
});
