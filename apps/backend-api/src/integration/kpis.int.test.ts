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
import { TeamleadService } from '../cases/teamlead.service.js';

/**
 * Integration test for GET /api/teamlead/kpis (Task 1.3). Aggregates over
 * ZstRecord + case statuses for the date — replaces the hardcoded demo
 * constants with computed values.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';

function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let teamleadSvc: TeamleadService;

async function seed(): Promise<void> {
  const emp = await prisma.user.create({ data: { employeeNo: 'ma-101', displayName: 'Anna' } });
  const loc = await prisma.location.create({
    data: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });
  const docSet = await prisma.documentSet.create({
    data: { source: 'pdf_folder', importKey: 'kpi-set-1', status: 'parsed' },
  });
  // One completed case + one still-open case, both booked on DATE.
  const done = await prisma.goodsReceiptCase.create({
    data: {
      documentSetId: docSet.id,
      weBelegNo: 'WE-KPI-DONE',
      bookingDate: asDate(DATE),
      branchNo: '1',
      storageLocationId: loc.id,
      section: 7,
      totalQuantity: 20,
      status: 'completed',
      effortPoints: 8,
      estimatedMinutes: 20,
    },
  });
  await prisma.goodsReceiptCase.create({
    data: {
      documentSetId: docSet.id,
      weBelegNo: 'WE-KPI-OPEN',
      bookingDate: asDate(DATE),
      branchNo: '1',
      storageLocationId: loc.id,
      section: 7,
      totalQuantity: 10,
      status: 'ready',
      effortPoints: 4,
      estimatedMinutes: 12,
    },
  });
  await prisma.zstRecord.create({
    data: {
      idempotencyKey: 'kpi-zst-1',
      caseId: done.id,
      employeeId: emp.id,
      completedQuantity: 20,
      effortPoints: 8,
      startedAt: new Date(`${DATE}T08:00:00.000Z`),
      completedAt: new Date(`${DATE}T08:30:00.000Z`), // 30 min elapsed
      source: 'mobile_app',
    },
  });
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
  const live = new LiveStatusService();
  teamleadSvc = new TeamleadService(p, workflow, events, live);
  await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('kpis (§10.1 GET /api/teamlead/kpis)', () => {
  it('aggregates ZST records + case statuses for the date', async () => {
    const kpi = await teamleadSvc.kpis(DATE);

    expect(kpi.date).toBe(DATE);
    expect(kpi.completedCases).toBe(1);
    expect(kpi.totalCases).toBe(2);
    expect(kpi.completedParts).toBe(20);
    expect(kpi.effortPoints).toBe(8);
    expect(kpi.workedMinutes).toBe(30); // 08:00 → 08:30
    expect(kpi.partsPerHour).toBe(40); // 20 parts / 0.5h
    expect(kpi.effortPointsPerHour).toBe(16); // 8 / 0.5h
  });

  it('returns zeroed rates without crashing when no worked minutes', async () => {
    const empty = await teamleadSvc.kpis('2020-01-01');
    expect(empty.completedParts).toBe(0);
    expect(empty.workedMinutes).toBe(0);
    expect(empty.partsPerHour).toBe(0);
    expect(empty.effortPointsPerHour).toBe(0);
  });
});
