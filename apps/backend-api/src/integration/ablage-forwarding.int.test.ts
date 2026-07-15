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
import { TeamleadReadService } from '../cases/teamlead-read.service.js';
import { TeamleadService } from '../cases/teamlead.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * Digitale Ablage (C4/C5): the forward/unforward endpoints (forwardedTo
 * round-trip + audit events) and the PoolItemDto.openIssue projection (latest
 * OPEN issue's kind + note; resolved issues never leak onto the card preview).
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAY = '2026-06-15';

const teamlead: Principal = {
  sub: 'oidc-tl-1',
  employeeNo: 'tl-001',
  roles: [Role.Teamlead],
  claims: {},
};

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let readSvc: TeamleadReadService;
let teamleadSvc: TeamleadService;

interface SeededIds {
  plain: string;
  withIssue: string;
  withResolvedIssue: string;
}

async function seed(): Promise<SeededIds> {
  const emp = await prisma.user.create({ data: { employeeNo: 'ma-401', displayName: 'Mara' } });
  const regal = await prisma.location.create({
    data: { code: 'R1', displayName: 'Regal 1', kind: 'regal', sequenceIndex: 1 },
  });

  const base = {
    source: 'manual' as const,
    branchNo: '001',
    primaryShopNo: '21',
    bookingDate: new Date(`${DAY}T00:00:00.000Z`),
    totalQuantity: 10,
    effortPoints: 5,
    estimatedMinutes: 10,
    storageLocationId: regal.id,
  };

  const plain = await prisma.goodsReceiptCase.create({
    data: { ...base, externalRef: 'fw-1', weBelegNo: 'WE-FW-001', status: 'parked' },
  });
  const withIssue = await prisma.goodsReceiptCase.create({
    data: { ...base, externalRef: 'fw-2', weBelegNo: 'WE-FW-002', status: 'issue_open' },
  });
  const withResolvedIssue = await prisma.goodsReceiptCase.create({
    data: { ...base, externalRef: 'fw-3', weBelegNo: 'WE-FW-003', status: 'ready' },
  });

  // Two issues on WE-FW-002 — the NEWER open one must win the preview.
  await prisma.issue.create({
    data: {
      caseId: withIssue.id,
      scope: 'position',
      employeeId: emp.id,
      kind: 'manual',
      reasonId: 'pr_wrong_color',
      reasonLabel: 'falsche Farbe',
      description: 'Farbe weicht ab',
      status: 'open',
      reportedAt: new Date(`${DAY}T09:00:00.000Z`),
    },
  });
  await prisma.issue.create({
    data: {
      caseId: withIssue.id,
      scope: 'position',
      employeeId: emp.id,
      kind: 'manual',
      reasonId: 'pr_damaged_goods',
      reasonLabel: 'beschädigt',
      description: 'Karton beschädigt',
      status: 'open',
      reportedAt: new Date(`${DAY}T11:00:00.000Z`),
    },
  });
  // A RESOLVED issue must NOT surface as openIssue.
  await prisma.issue.create({
    data: {
      caseId: withResolvedIssue.id,
      scope: 'position',
      employeeId: emp.id,
      kind: 'manual',
      reasonId: 'pr_label_problem',
      reasonLabel: 'Etikettenproblem',
      description: 'war falsch etikettiert',
      status: 'resolved',
      reportedAt: new Date(`${DAY}T08:00:00.000Z`),
    },
  });

  return { plain: plain.id, withIssue: withIssue.id, withResolvedIssue: withResolvedIssue.id };
}

let ids: SeededIds;

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
  const live = new LiveStatusService();
  readSvc = new TeamleadReadService(p);
  teamleadSvc = new TeamleadService(p, workflow, events, live);
  ids = await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('C5 forward / unforward', () => {
  it('forwards a Beleg (status-neutral) and writes case.forwarded', async () => {
    const result = await teamleadSvc.forward(teamlead, ids.plain, {
      recipient: 'retourenabteilung',
      reason: 'Retoure klären',
    });
    expect(result.eventId).not.toBeNull();
    // Forwarding is status-neutral: the Beleg keeps its §7.1 state.
    expect(result.status).toBe('parked');

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: ids.plain } });
    expect(row.forwardedTo).toBe('retourenabteilung');
    expect(row.status).toBe('parked');

    const events = await prisma.workflowEvent.findMany({
      where: { entityId: ids.plain, eventType: 'case.forwarded' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      recipient: 'retourenabteilung',
      reason: 'Retoure klären',
    });
  });

  it('round-trips forwardedTo on the list DTO', async () => {
    const res = await readSvc.listPool({ q: 'FW-001' });
    expect(res.items[0]?.forwardedTo).toBe('retourenabteilung');
  });

  it('unforwards („Zurückholen") and writes case.forward_cleared', async () => {
    await teamleadSvc.unforward(teamlead, ids.plain);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: ids.plain } });
    expect(row.forwardedTo).toBeNull();

    const events = await prisma.workflowEvent.findMany({
      where: { entityId: ids.plain, eventType: 'case.forward_cleared' },
    });
    expect(events).toHaveLength(1);

    const res = await readSvc.listPool({ q: 'FW-001' });
    expect(res.items[0]?.forwardedTo).toBeNull();
  });
});

describe('C4 openIssue projection', () => {
  it('projects the LATEST open issue (kind + note) onto the pool item', async () => {
    const res = await readSvc.listPool({ q: 'FW-002' });
    expect(res.items[0]?.openIssue).toEqual({
      kind: 'manual',
      reasonLabel: 'beschädigt',
      note: 'Karton beschädigt',
    });
  });

  it('is null without an open issue (resolved issues never leak)', async () => {
    const plain = await readSvc.listPool({ q: 'FW-001' });
    expect(plain.items[0]?.openIssue).toBeNull();

    const resolved = await readSvc.listPool({ q: 'FW-003' });
    expect(resolved.items[0]?.openIssue).toBeNull();
  });
});
