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
 * End-to-end functional integration against a REAL Postgres (Testcontainers).
 * Exercises the three pre-pilot acceptance flows from §17.1/§17.2: assignment
 * (engine → persisted bundles), issue-flow (report → resolve → release), and ZST
 * (digital completion → ZstRecord + KPI basis). Redis is only used by the parser
 * queue, not by these backend flows, so a Postgres container is sufficient.
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

async function seed(): Promise<{ employeeId: string; caseIds: string[] }> {
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
    data: { source: 'pdf_folder', importKey: 'itest-set-1', status: 'parsed' },
  });

  const caseIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await prisma.goodsReceiptCase.create({
      data: {
        documentSetId: docSet.id,
        weBelegNo: `WE-ITEST-${i}`,
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
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('assignment (§8.3 + §17.1 Zuteilung)', () => {
  it('runs the engine, persists bundles and links cases — deterministic, < 5 s', async () => {
    const { caseIds } = await seed();

    const result = await assignment.recalculate(teamlead);

    expect(result.bundleCount).toBeGreaterThanOrEqual(1);
    expect(result.assignedCaseCount).toBe(caseIds.length);
    expect(result.durationMs).toBeLessThan(5_000); // Anhang E.5 budget

    const assignedCases = await prisma.goodsReceiptCase.findMany({
      where: { id: { in: caseIds } },
    });
    expect(assignedCases.every((c) => c.status === 'assigned')).toBe(true);
    expect(assignedCases.every((c) => c.assignedBundleId !== null)).toBe(true);

    const bundles = await prisma.assignmentBundle.count();
    expect(bundles).toBe(result.bundleCount);

    const created = await prisma.workflowEvent.count({ where: { eventType: 'bundle.created' } });
    const assignedEv = await prisma.workflowEvent.count({ where: { eventType: 'bundle.assigned' } });
    expect(created).toBe(result.bundleCount);
    expect(assignedEv).toBe(result.bundleCount);

    const integrity = await events.verifyIntegrity();
    expect(integrity.ok).toBe(true); // §7.2/§16.2 tamper-evident chain
  });
});

describe('issue-flow (§4.5 + §17.1 Problemfall)', () => {
  it('report → resolve moves the case through the §7.1 states', async () => {
    const owned = await prisma.goodsReceiptCase.findFirstOrThrow({ where: { status: 'assigned' } });

    await cases.startPreparation(employee, owned.id); // assigned → in_progress
    await cases.reportIssue(employee, owned.id, {
      caseId: owned.id,
      scope: 'case',
      issueType: 'missing_quantity',
      description: 'Fehlmenge',
    });

    let row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: owned.id } });
    expect(row.status).toBe('issue_open');
    const issue = await prisma.issue.findFirstOrThrow({ where: { caseId: owned.id } });
    expect(issue.status).toBe('open');

    await teamleadSvc.resolveIssue(teamlead, issue.id, { resolution: 'Nachgezählt' });
    row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: owned.id } });
    expect(row.status).toBe('in_progress'); // issue_open → in_progress (resume work)

    const resolved = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(resolved.status).toBe('resolved');
    expect(resolved.releasedBy).toBe(teamlead.sub);

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('ZST (§4.6 + §17.1 ZST)', () => {
  it('digital completion produces a correct ZST record + KPI basis', async () => {
    const owned = await prisma.goodsReceiptCase.findFirstOrThrow({
      where: { status: 'assigned' },
    });
    // Fast-forward to the in-progress state from which completion is legal.
    await prisma.goodsReceiptCase.update({
      where: { id: owned.id },
      data: { status: 'in_progress' },
    });

    await cases.complete(employee, owned.id);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: owned.id } });
    expect(row.status).toBe('completed');

    const zst = await prisma.zstRecord.findFirstOrThrow({ where: { caseId: owned.id } });
    expect(zst.completedQuantity).toBe(row.totalQuantity);
    expect(zst.effortPoints).toBe(row.effortPoints);
    expect(zst.source).toBe('mobile_app');

    const completedEv = await prisma.workflowEvent.findFirst({
      where: { entityId: owned.id, eventType: 'case.completed' },
    });
    expect(completedEv).not.toBeNull();
    const zstEv = await prisma.workflowEvent.findFirst({ where: { eventType: 'zst.created' } });
    expect(zstEv).not.toBeNull();

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});
