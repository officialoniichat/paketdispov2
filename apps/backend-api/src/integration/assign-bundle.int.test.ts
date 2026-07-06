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
import { Role, type Principal } from '../auth/rbac.js';

/**
 * A1/A2 „Bündel anlegen" (assignBundleToEmployee) and B2 „Beleg verschieben" (moveCase)
 * against a REAL Postgres (Testcontainers). Covers: multi-Beleg Bündel creation for a
 * free employee, extending an existing Bündel with several Belege in one call, the
 * all-or-nothing rollback when one Beleg in the batch is invalid, and moving an
 * `assigned` Beleg straight from one employee's Bündel into another's.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-20';
const NOW = new Date(`${DATE}T08:00:00.000Z`);

function asDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

const teamlead: Principal = {
  sub: 'oidc-tl-1',
  employeeNo: 'tl-001',
  roles: [Role.Teamlead],
  claims: {},
};

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let events: EventLogService;
let teamleadSvc: TeamleadService;

async function seed(): Promise<void> {
  const frieda = await prisma.user.create({
    data: { employeeNo: 'ma-301', displayName: 'Frieda', bereiche: ['Regal'] },
  });
  const bernd = await prisma.user.create({
    data: { employeeNo: 'ma-302', displayName: 'Bernd', bereiche: ['Regal'] },
  });
  const clara = await prisma.user.create({
    data: { employeeNo: 'ma-303', displayName: 'Clara', bereiche: ['Regal'] },
  });
  await prisma.user.create({ data: { employeeNo: 'tl-001', displayName: 'TL' } });

  const loc = await prisma.location.create({
    data: { code: 'R31', displayName: 'Regal 31', kind: 'regal', sequenceIndex: 31 },
  });

  const day = asDay(DATE);
  for (const emp of [frieda, bernd, clara]) {
    await prisma.shift.create({
      data: {
        employeeId: emp.id,
        date: day,
        plannedStart: new Date(`${DATE}T07:00:00.000Z`),
        plannedEnd: new Date(`${DATE}T15:00:00.000Z`),
        plannedHours: 8,
        netCapacityMinutes: 480,
      },
    });
  }

  // Ready pool: WE-C0..WE-C9 (estimatedMinutes 15 each → deterministic effort sums).
  for (let i = 0; i < 10; i++) {
    await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'bundle-set-1',
        weBelegNo: `WE-C${i}`,
        bookingDate: day,
        branchNo: '1',
        storageLocationId: loc.id,
        section: 7,
        totalQuantity: 10,
        status: 'ready',
        effortPoints: 4,
        estimatedMinutes: 15,
      },
    });
  }

  // Bernd already holds a Bündel with ONE item (simulates an earlier/engine plan).
  const berndCase = await prisma.goodsReceiptCase.create({
    data: {
      source: 'manual',
      externalRef: 'bundle-set-1',
      weBelegNo: 'WE-C-EXIST',
      bookingDate: day,
      branchNo: '1',
      storageLocationId: loc.id,
      section: 7,
      totalQuantity: 10,
      status: 'assigned',
      effortPoints: 4,
      estimatedMinutes: 15,
    },
  });
  const bundle = await prisma.assignmentBundle.create({
    data: {
      employeeId: bernd.id,
      date: day,
      status: 'assigned',
      createdBy: 'system',
      plannedEffortMinutes: 15,
    },
  });
  await prisma.assignmentItem.create({
    data: { bundleId: bundle.id, caseId: berndCase.id, sequence: 0 },
  });
  await prisma.goodsReceiptCase.update({
    where: { id: berndCase.id },
    data: { assignedBundleId: bundle.id },
  });
}

/** A still-ready pool Beleg by weBelegNo (stable selector, no insertion-order reliance). */
async function ready(weBelegNo: string): Promise<{ id: string }> {
  return prisma.goodsReceiptCase.findFirstOrThrow({
    where: { weBelegNo, status: 'ready' },
    select: { id: true },
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
  events = new EventLogService(p);
  const workflow = new WorkflowService(p, events);
  const live = new LiveStatusService();
  teamleadSvc = new TeamleadService(p, workflow, events, live);
  await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('A1 assignBundleToEmployee — free employee', () => {
  it('creates ONE new Bündel with all Belege in the given order', async () => {
    const [a, b, c] = await Promise.all([ready('WE-C0'), ready('WE-C1'), ready('WE-C2')]);

    const result = await teamleadSvc.assignBundleToEmployee(
      teamlead,
      'ma-301',
      { caseIds: [a.id, b.id, c.id], reason: 'Bündel für Frühschicht' },
      NOW,
    );

    expect(result.bundleCreated).toBe(true);
    expect(result.caseIds).toEqual([a.id, b.id, c.id]);
    expect(result.plannedEffortMinutes).toBe(45); // 3 × 15
    expect(result.caseId).toBeNull();
    expect(result.caseStatus).toBeNull();

    const bundles = await prisma.assignmentBundle.findMany({
      where: { employee: { employeeNo: 'ma-301' } },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
    expect(bundles.length).toBe(1);
    expect(bundles[0]!.items.map((i) => i.caseId)).toEqual([a.id, b.id, c.id]);

    for (const kase of [a, b, c]) {
      const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: kase.id } });
      expect(row.status).toBe('assigned');
      expect(row.assignedBundleId).toBe(result.bundleId);
    }

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('A2 assignBundleToEmployee — employee already has a Bündel', () => {
  it('appends all Belege to the SAME existing Bündel, no second one', async () => {
    const [d, e] = await Promise.all([ready('WE-C3'), ready('WE-C4')]);

    const result = await teamleadSvc.assignBundleToEmployee(
      teamlead,
      'ma-302',
      { caseIds: [d.id, e.id], reason: 'Nachschub' },
      NOW,
    );

    expect(result.bundleCreated).toBe(false);

    const bundles = await prisma.assignmentBundle.findMany({
      where: { employee: { employeeNo: 'ma-302' } },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
    expect(bundles.length).toBe(1);
    const items = bundles[0]!.items;
    expect(items.length).toBe(3); // 1 existing + 2 appended
    expect(items.slice(1).map((i) => i.caseId)).toEqual([d.id, e.id]);
    expect(result.plannedEffortMinutes).toBe(45); // 15 existing + 15 + 15

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('A3 assignBundleToEmployee — all-or-nothing', () => {
  it('rolls back the WHOLE batch if one caseId is not ready, and touches no case', async () => {
    const [good1, good2] = await Promise.all([ready('WE-C5'), ready('WE-C6')]);
    const alreadyAssigned = await prisma.goodsReceiptCase.findFirstOrThrow({
      where: { weBelegNo: 'WE-C-EXIST' },
    });

    await expect(
      teamleadSvc.assignBundleToEmployee(
        teamlead,
        'ma-303',
        { caseIds: [good1.id, alreadyAssigned.id, good2.id], reason: 'Tippfehler-Batch' },
        NOW,
      ),
    ).rejects.toThrow(/nicht zugewiesen|not|zurückgenommen/i);

    // Neither good1 nor good2 was touched — the transaction rolled back entirely.
    const rowGood1 = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: good1.id } });
    const rowGood2 = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: good2.id } });
    expect(rowGood1.status).toBe('ready');
    expect(rowGood1.assignedBundleId).toBeNull();
    expect(rowGood2.status).toBe('ready');
    expect(rowGood2.assignedBundleId).toBeNull();

    const bundles = await prisma.assignmentBundle.findMany({
      where: { employee: { employeeNo: 'ma-303' } },
    });
    expect(bundles.length).toBe(0); // no Bündel was created either

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('rejects duplicate caseIds in the same batch', async () => {
    const dup = await ready('WE-C7');
    await expect(
      teamleadSvc.assignBundleToEmployee(
        teamlead,
        'ma-303',
        { caseIds: [dup.id, dup.id], reason: 'x' },
        NOW,
      ),
    ).rejects.toThrow(/doppelte/i);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: dup.id } });
    expect(row.status).toBe('ready');
  });
});

describe('A audit — one event covers the whole batch', () => {
  it("appends ONE 'assignment.overridden' event with action 'manual_assign' and all caseIds", async () => {
    const [f, g] = await Promise.all([ready('WE-C8'), ready('WE-C9')]);
    const result = await teamleadSvc.assignBundleToEmployee(
      teamlead,
      'ma-303',
      { caseIds: [f.id, g.id], reason: 'Audit-Probe Bündel' },
      NOW,
    );

    const ev = await prisma.workflowEvent.findUniqueOrThrow({ where: { id: result.eventId! } });
    const payload = ev.payload as Record<string, unknown>;
    expect(payload['action']).toBe('manual_assign');
    expect(payload['reason']).toBe('Audit-Probe Bündel');
    expect(payload['caseIds']).toEqual([f.id, g.id]);
    expect(payload['employeeNo']).toBe('ma-303');
    expect(ev.actorType).toBe('teamlead');

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('B2 moveCase — move an assigned Beleg to another employee', () => {
  it('moves the Beleg out of the source Bündel and into the target (find-or-create)', async () => {
    // ma-301 currently holds WE-C0/1/2 from the first test above.
    const source = await prisma.assignmentBundle.findFirstOrThrow({
      where: { employee: { employeeNo: 'ma-301' } },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
    const moving = source.items[1]!; // WE-C1, middle item

    // ma-303 already has a Bündel from the "A audit" test above (WE-C8/WE-C9) — the
    // move must APPEND to it, not create a second one.
    const targetBefore = await prisma.assignmentBundle.findFirstOrThrow({
      where: { employee: { employeeNo: 'ma-303' } },
      include: { items: true },
    });
    expect(targetBefore.items.length).toBe(2);

    const result = await teamleadSvc.moveCase(
      teamlead,
      source.id,
      moving.caseId,
      { targetEmployeeNo: 'ma-303', reason: 'Auslastung ausgleichen' },
      NOW,
    );

    expect(result.bundleCreated).toBe(false);
    expect(result.bundleId).toBe(targetBefore.id);
    expect(result.caseId).toBe(moving.caseId);
    expect(result.caseStatus).toBe('assigned');
    expect(result.caseIds).toContain(moving.caseId);
    expect(result.caseIds.length).toBe(3);

    // Source Bündel lost the item and re-sequenced the remainder gaplessly.
    const sourceAfter = await prisma.assignmentBundle.findUniqueOrThrow({
      where: { id: source.id },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
    expect(sourceAfter.items.map((i) => i.caseId)).not.toContain(moving.caseId);
    expect(sourceAfter.items.map((i) => i.sequence)).toEqual(
      sourceAfter.items.map((_, i) => i),
    );
    expect(sourceAfter.plannedEffortMinutes).toBe(30); // 45 - 15

    // The moved case now links to ma-303's (existing) Bündel, not the source.
    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: moving.caseId } });
    expect(row.status).toBe('assigned');
    expect(row.assignedBundleId).toBe(result.bundleId);
    expect(row.assignedBundleId).not.toBe(source.id);

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('rejects moving a case that has already started (409, not "assigned")', async () => {
    const bundle = await prisma.assignmentBundle.findFirstOrThrow({
      where: { employee: { employeeNo: 'ma-303' } },
      include: { items: true },
    });
    const item = bundle.items[0]!;
    await prisma.goodsReceiptCase.update({
      where: { id: item.caseId },
      data: { status: 'in_progress' },
    });

    await expect(
      teamleadSvc.moveCase(
        teamlead,
        bundle.id,
        item.caseId,
        { targetEmployeeNo: 'ma-302', reason: 'x' },
        NOW,
      ),
    ).rejects.toThrow(/assigned/i);
  });
});
