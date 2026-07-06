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
 * Belege-Ansicht (A1–A7): server-side list scopes/filters/sort of
 * GET /api/teamlead/cases (listPool), the A7 flag-attention endpoints, and the
 * completedAt stamp on the completion transition. Seeds a small mixed population
 * (aktiv / abgeschlossen / archiv / topf) and asserts the projections.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAY_1 = '2026-06-15';
const DAY_2 = '2026-06-16';

const teamlead: Principal = {
  sub: 'oidc-tl-1',
  employeeNo: 'tl-001',
  roles: [Role.Teamlead],
  claims: {},
};

function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let readSvc: TeamleadReadService;
let teamleadSvc: TeamleadService;
let workflow: WorkflowService;

interface SeededIds {
  readyRegal: string;
  readyHaengebahn: string;
  completed: string;
  zstDone: string;
  blocked: string;
  attention: string;
  bundledFirst: string;
  bundledSecond: string;
  inProgress: string;
}

async function seed(): Promise<SeededIds> {
  const emp = await prisma.user.create({ data: { employeeNo: 'ma-301', displayName: 'Anna' } });
  const regal = await prisma.location.create({
    data: { code: 'R1', displayName: 'Regal 1', kind: 'regal', sequenceIndex: 1 },
  });
  const haengebahn = await prisma.location.create({
    data: { code: 'HB-1', displayName: 'Hängebahn 1', kind: 'haengebahn', sequenceIndex: 2 },
  });

  const base = {
    source: 'manual' as const,
    branchNo: '001',
    primaryShopNo: '21',
    bookingDate: asDate(DAY_1),
    totalQuantity: 10,
    effortPoints: 5,
    estimatedMinutes: 10,
  };

  const readyRegal = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-1',
      weBelegNo: 'WE-BV-001',
      storageLocationId: regal.id,
      status: 'ready',
      // Etiketten ja: price label print required on the work instruction.
      workInstruction: { create: { priceLabelPrintRequired: true } },
      // Mehr-Shop (A3): a second shop over the positions.
      positions: {
        create: [
          {
            positionNo: 1,
            wgr: '4711',
            supplierArticleNo: 'A-1',
            supplierColor: 'rot',
            branchNo: '001',
            shopNo: '22',
            status: 'open',
          },
        ],
      },
    },
  });
  const readyHaengebahn = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-2',
      weBelegNo: 'WE-BV-002',
      branchNo: '002',
      bookingDate: asDate(DAY_2),
      storageLocationId: haengebahn.id,
      status: 'ready',
    },
  });
  const completed = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-3',
      weBelegNo: 'WE-BV-003',
      storageLocationId: regal.id,
      status: 'completed',
      completedAt: new Date(`${DAY_1}T14:30:00.000Z`),
      docuWareUrl: 'https://docuware.example.com/lt-archiv/WE-BV-003',
    },
  });
  const zstDone = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-4',
      weBelegNo: 'WE-BV-004',
      storageLocationId: regal.id,
      status: 'zst_done',
      completedAt: new Date(`${DAY_1}T13:00:00.000Z`),
      docuWareUrl: 'https://docuware.example.com/lt-archiv/WE-BV-004',
    },
  });
  const blocked = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-5',
      weBelegNo: 'WE-BV-005',
      status: 'blocked',
      missingFields: ['Lagerplatz'],
    },
  });
  const attention = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-6',
      weBelegNo: 'WE-BV-006',
      storageLocationId: regal.id,
      status: 'ready',
      attentionFlag: true,
      attentionNote: 'Bucherin: bitte prüfen',
    },
  });

  // A5 bundleQueue: a two-case Bündel (nothing started yet) + one running case.
  const bundle = await prisma.assignmentBundle.create({
    data: { employeeId: emp.id, date: asDate(DAY_1), status: 'assigned' },
  });
  const bundledFirst = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-7',
      weBelegNo: 'WE-BV-007',
      storageLocationId: regal.id,
      status: 'assigned',
      assignedBundleId: bundle.id,
    },
  });
  const bundledSecond = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-8',
      weBelegNo: 'WE-BV-008',
      storageLocationId: regal.id,
      status: 'assigned',
      assignedBundleId: bundle.id,
    },
  });
  await prisma.assignmentItem.create({
    data: { bundleId: bundle.id, caseId: bundledFirst.id, sequence: 0 },
  });
  await prisma.assignmentItem.create({
    data: { bundleId: bundle.id, caseId: bundledSecond.id, sequence: 1 },
  });

  // For the completedAt stamping test (in_progress → completed via workflow).
  const inProgress = await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      externalRef: 'bv-9',
      weBelegNo: 'WE-BV-009',
      storageLocationId: regal.id,
      status: 'in_progress',
    },
  });

  return {
    readyRegal: readyRegal.id,
    readyHaengebahn: readyHaengebahn.id,
    completed: completed.id,
    zstDone: zstDone.id,
    blocked: blocked.id,
    attention: attention.id,
    bundledFirst: bundledFirst.id,
    bundledSecond: bundledSecond.id,
    inProgress: inProgress.id,
  };
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
  workflow = new WorkflowService(p, events);
  const live = new LiveStatusService();
  readSvc = new TeamleadReadService(p);
  teamleadSvc = new TeamleadService(p, workflow, events, live);
  ids = await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('Belege list scopes (A2/A6/A7 GET /api/teamlead/cases?scope=…)', () => {
  it('scope=aktiv returns only in-flight statuses', async () => {
    const res = await readSvc.listPool({ scope: 'aktiv' });
    const nos = res.items.map((i) => i.weBelegNo).sort();
    expect(nos).toEqual([
      'WE-BV-001',
      'WE-BV-002',
      'WE-BV-006',
      'WE-BV-007',
      'WE-BV-008',
      'WE-BV-009',
    ]);
  });

  it('scope=archiv returns completed + zst_done with Abschlussdatum + DocuWare link', async () => {
    const res = await readSvc.listPool({ scope: 'archiv' });
    const nos = res.items.map((i) => i.weBelegNo).sort();
    expect(nos).toEqual(['WE-BV-003', 'WE-BV-004']);
    for (const item of res.items) {
      expect(item.completedAt).not.toBeNull();
      expect(item.docuWareUrl).toMatch(/^https:\/\/docuware\.example\.com\//);
    }
  });

  it('scope=abgeschlossen returns only completed (not zst_done)', async () => {
    const res = await readSvc.listPool({ scope: 'abgeschlossen' });
    expect(res.items.map((i) => i.weBelegNo)).toEqual(['WE-BV-003']);
  });

  it('scope=topf returns attention-flagged AND blocked/needs_review cases', async () => {
    const res = await readSvc.listPool({ scope: 'topf' });
    const nos = res.items.map((i) => i.weBelegNo).sort();
    expect(nos).toEqual(['WE-BV-005', 'WE-BV-006']);
    const blocked = res.items.find((i) => i.weBelegNo === 'WE-BV-005');
    expect(blocked?.missingFields).toEqual(['Lagerplatz']);
    const flagged = res.items.find((i) => i.weBelegNo === 'WE-BV-006');
    expect(flagged?.attentionFlag).toBe(true);
    expect(flagged?.attentionNote).toBe('Bucherin: bitte prüfen');
  });
});

describe('Belege list filters + sort (A2)', () => {
  it('q matches the WE-Beleg-Nr (contains)', async () => {
    const res = await readSvc.listPool({ q: 'BV-002' });
    expect(res.items.map((i) => i.weBelegNo)).toEqual(['WE-BV-002']);
  });

  it('filters by Filiale, assignment and Etiketten', async () => {
    const byBranch = await readSvc.listPool({ branchNo: '002' });
    expect(byBranch.items.map((i) => i.weBelegNo)).toEqual(['WE-BV-002']);

    const unassigned = await readSvc.listPool({ scope: 'aktiv', assigned: 'no' });
    expect(unassigned.items.every((i) => i.assignedEmployeeName === null)).toBe(true);
    expect(unassigned.items.map((i) => i.weBelegNo)).not.toContain('WE-BV-007');

    const withLabels = await readSvc.listPool({ labels: 'yes' });
    expect(withLabels.items.map((i) => i.weBelegNo)).toEqual(['WE-BV-001']);
    expect(withLabels.items[0]?.labelsRequired).toBe(true);
  });

  it('filters by the fixed Bereich (derived from the Lagerklasse)', async () => {
    const res = await readSvc.listPool({ bereich: 'Hängebahn' });
    expect(res.items.map((i) => i.weBelegNo)).toEqual(['WE-BV-002']);
    expect(res.items[0]?.bereich).toBe('Hängebahn');
  });

  it('filters by booking date range', async () => {
    const res = await readSvc.listPool({ bookingFrom: DAY_2, bookingTo: DAY_2 });
    expect(res.items.map((i) => i.weBelegNo)).toEqual(['WE-BV-002']);
  });

  it('sorts server-side (weBelegNo desc) and paginates with total', async () => {
    const res = await readSvc.listPool({ sortBy: 'weBelegNo', sortDir: 'desc', limit: 3 });
    expect(res.total).toBe(9);
    expect(res.items.map((i) => i.weBelegNo)).toEqual(['WE-BV-009', 'WE-BV-008', 'WE-BV-007']);
  });

  it('projects Mehr-Shop (primary first) on the summary', async () => {
    const res = await readSvc.listPool({ q: 'BV-001' });
    expect(res.items[0]?.shopNos).toEqual(['21', '22']);
    expect(res.items[0]?.branchNo).toBe('001');
  });
});

describe('A5 bundleQueue („vorbereitet · Pos n")', () => {
  it('exposes position + started=false while nothing is in Arbeit', async () => {
    const res = await readSvc.listPool({ q: 'BV-00' });
    const first = res.items.find((i) => i.id === ids.bundledFirst);
    const second = res.items.find((i) => i.id === ids.bundledSecond);
    expect(first?.bundleQueue).toMatchObject({ position: 1, started: false, employeeName: 'Anna' });
    expect(second?.bundleQueue).toMatchObject({ position: 2, started: false });
    const solo = res.items.find((i) => i.id === ids.readyRegal);
    expect(solo?.bundleQueue).toBeNull();
  });

  it('flips started=true once a bundle case is in Arbeit', async () => {
    await prisma.goodsReceiptCase.update({
      where: { id: ids.bundledFirst },
      data: { status: 'in_progress' },
    });
    const res = await readSvc.listPool({ q: 'BV-008' });
    expect(res.items[0]?.bundleQueue?.started).toBe(true);
  });
});

describe('A7 flag-attention endpoints', () => {
  it('flags a case (note + audit event) and surfaces it in the Topf', async () => {
    const result = await teamleadSvc.flagAttention(teamlead, ids.readyRegal, {
      note: 'Ware gesondert prüfen',
    });
    expect(result.eventId).not.toBeNull();

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: ids.readyRegal },
    });
    expect(row.attentionFlag).toBe(true);
    expect(row.attentionNote).toBe('Ware gesondert prüfen');

    const topf = await readSvc.listPool({ scope: 'topf' });
    expect(topf.items.map((i) => i.id)).toContain(ids.readyRegal);

    const events = await prisma.workflowEvent.findMany({
      where: { entityId: ids.readyRegal, eventType: 'case.attention_flagged' },
    });
    expect(events).toHaveLength(1);
  });

  it('unflags the case again (note cleared, audited, out of the Topf)', async () => {
    await teamleadSvc.unflagAttention(teamlead, ids.readyRegal);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: ids.readyRegal },
    });
    expect(row.attentionFlag).toBe(false);
    expect(row.attentionNote).toBeNull();

    const topf = await readSvc.listPool({ scope: 'topf' });
    expect(topf.items.map((i) => i.id)).not.toContain(ids.readyRegal);

    const events = await prisma.workflowEvent.findMany({
      where: { entityId: ids.readyRegal, eventType: 'case.attention_cleared' },
    });
    expect(events).toHaveLength(1);
  });
});

describe('completedAt stamp (A6)', () => {
  it('is set exactly once when a case reaches completed', async () => {
    const before = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: ids.inProgress },
      select: { completedAt: true },
    });
    expect(before.completedAt).toBeNull();

    await workflow.transition({
      caseId: ids.inProgress,
      toStatus: 'completed',
      eventType: 'case.completed',
      actor: { actorType: 'teamlead', actorId: teamlead.sub },
    });
    const after = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: ids.inProgress },
      select: { completedAt: true },
    });
    expect(after.completedAt).not.toBeNull();

    // zst_done keeps the ORIGINAL completion timestamp (stamped once).
    await workflow.transition({
      caseId: ids.inProgress,
      toStatus: 'zst_done',
      actor: { actorType: 'system' },
    });
    const final = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: ids.inProgress },
      select: { completedAt: true },
    });
    expect(final.completedAt?.toISOString()).toBe(after.completedAt?.toISOString());
  });
});
