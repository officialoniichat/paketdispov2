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
import { TeamleadReadService } from '../cases/teamlead-read.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * §8.4 manuelle Zuweisung „Beleg → Mitarbeiter" against a REAL Postgres (Testcontainers).
 * A teamlead drops a free `ready` Beleg onto an employee from the Mitarbeiterboard:
 *   - FREE employee (no Bündel)  → a NEW Bündel is created, Beleg becomes its first member.
 *   - employee WITH a Bündel     → Beleg is appended to the SAME Bündel (no second one).
 * The override is reasoned + audited (assignment.overridden / action 'manual_assign'). The
 * test drives the service directly (no HTTP, no engine) for full determinism.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';
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
let read: TeamleadReadService;
let assignment: AssignmentService;

async function seed(): Promise<void> {
  const frieda = await prisma.user.create({
    data: { employeeNo: 'ma-201', displayName: 'Frieda', bereiche: ['Regal'] },
  });
  const bernd = await prisma.user.create({
    data: { employeeNo: 'ma-202', displayName: 'Bernd', bereiche: ['Regal'] },
  });
  await prisma.user.create({ data: { employeeNo: 'tl-001', displayName: 'TL' } });

  const loc = await prisma.location.create({
    data: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });

  const day = asDay(DATE);
  for (const emp of [frieda, bernd]) {
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

  // Ready pool: WE-A0..WE-A5 (estimatedMinutes 20 each → deterministic effort sums).
  for (let i = 0; i < 6; i++) {
    await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'assign-set-1',
        weBelegNo: `WE-A${i}`,
        bookingDate: day,
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

  // Bernd already holds a Bündel with ONE item (simulates an earlier/engine plan).
  const berndCase = await prisma.goodsReceiptCase.create({
    data: {
      source: 'manual',
      externalRef: 'assign-set-1',
      weBelegNo: 'WE-B-EXIST',
      bookingDate: day,
      branchNo: '1',
      storageLocationId: loc.id,
      section: 7,
      totalQuantity: 20,
      status: 'assigned',
      effortPoints: 8,
      estimatedMinutes: 20,
    },
  });
  const bundle = await prisma.assignmentBundle.create({
    data: {
      employeeId: bernd.id,
      date: day,
      status: 'assigned',
      createdBy: 'system',
      plannedEffortMinutes: 20,
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
  read = new TeamleadReadService(p);
  assignment = new AssignmentService(p, events);
  await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('§8.4 assignToEmployee — free employee', () => {
  it('creates a new Bündel and places the Beleg as its first member', async () => {
    const before = await prisma.assignmentBundle.count({
      where: { employee: { employeeNo: 'ma-201' } },
    });
    expect(before).toBe(0); // Frieda is free

    const beleg = await ready('WE-A0');
    const result = await teamleadSvc.assignToEmployee(
      teamlead,
      'ma-201',
      { caseId: beleg.id, reason: 'Freie Kapazität' },
      NOW,
    );

    expect(result.bundleId).toBeTruthy();
    expect(result.bundleStatus).toBe('assigned');
    expect(result.caseStatus).toBe('assigned');
    expect(result.caseIds).toEqual([beleg.id]);
    expect(result.plannedEffortMinutes).toBe(20);
    expect(result.bundleCreated).toBe(true);
    expect(result.eventId).toBeTruthy();

    const bundles = await prisma.assignmentBundle.findMany({
      where: { employee: { employeeNo: 'ma-201' } },
      include: { items: true },
    });
    expect(bundles.length).toBe(1);
    expect(bundles[0]!.createdBy).toBe('teamlead');
    expect(bundles[0]!.date.toISOString().slice(0, 10)).toBe(DATE);
    expect(bundles[0]!.items.map((i) => i.caseId)).toEqual([beleg.id]);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: beleg.id } });
    expect(row.status).toBe('assigned');
    expect(row.assignedBundleId).toBe(result.bundleId);

    // board() surfaces Frieda with a real Bündel and the Beleg in cases[].
    const board = await read.board(DATE);
    const frieda = board.rows.find((r) => r.employeeNo === 'ma-201')!;
    expect(frieda.bundleId).toBe(result.bundleId);
    expect(frieda.bundleStatus).toBe('assigned');
    expect(frieda.cases.map((c) => c.weBelegNo)).toContain('WE-A0');

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('§8.4 assignToEmployee — employee already has a Bündel', () => {
  it('appends to the existing Bündel and creates no second one', async () => {
    const beleg = await ready('WE-A1');
    const result = await teamleadSvc.assignToEmployee(
      teamlead,
      'ma-202',
      { caseId: beleg.id, reason: 'Nachschub' },
      NOW,
    );

    const bundles = await prisma.assignmentBundle.findMany({
      where: { employee: { employeeNo: 'ma-202' } },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
    expect(bundles.length).toBe(1);
    const bundle = bundles[0]!;
    expect(bundle.items.length).toBe(2);
    expect(bundle.items[bundle.items.length - 1]!.caseId).toBe(beleg.id);
    expect(result.bundleId).toBe(bundle.id);
    expect(result.bundleCreated).toBe(false);
    expect(result.caseIds).toContain(beleg.id);
    expect(result.plannedEffortMinutes).toBe(40); // 20 existing + 20 appended

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: beleg.id } });
    expect(row.status).toBe('assigned');
    expect(row.assignedBundleId).toBe(bundle.id);

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('§8.4 assignToEmployee — guards', () => {
  it('rejects assigning a non-ready Beleg', async () => {
    const assigned = await prisma.goodsReceiptCase.findFirstOrThrow({
      where: { weBelegNo: 'WE-B-EXIST' },
    });
    expect(assigned.status).toBe('assigned');

    await expect(
      teamleadSvc.assignToEmployee(teamlead, 'ma-201', { caseId: assigned.id, reason: 'x' }, NOW),
    ).rejects.toThrow(/ready/i);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: assigned.id } });
    expect(row.status).toBe('assigned');
  });

  it('rejects an unknown employeeNo and rolls back (Beleg stays ready)', async () => {
    const beleg = await ready('WE-A2');
    await expect(
      teamleadSvc.assignToEmployee(teamlead, 'ghost-999', { caseId: beleg.id, reason: 'x' }, NOW),
    ).rejects.toThrow(/not found/i);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: beleg.id } });
    expect(row.status).toBe('ready');
    expect(row.assignedBundleId).toBeNull();
  });
});

describe('§8.4 assignToEmployee — audit', () => {
  it("appends an 'assignment.overridden' event with action 'manual_assign'", async () => {
    const beleg = await ready('WE-A3');
    const result = await teamleadSvc.assignToEmployee(
      teamlead,
      'ma-201',
      { caseId: beleg.id, reason: 'Audit-Probe' },
      NOW,
    );

    const ev = await prisma.workflowEvent.findFirstOrThrow({
      where: { eventType: 'assignment.overridden', entityId: result.bundleId! },
      orderBy: { seq: 'desc' },
    });
    const payload = ev.payload as Record<string, unknown>;
    expect(payload['action']).toBe('manual_assign');
    expect(payload['reason']).toBe('Audit-Probe');
    expect(payload['caseId']).toBe(beleg.id);
    expect(payload['employeeNo']).toBe('ma-201');
    expect(ev.actorType).toBe('teamlead');
    expect(ev.actorId).toBe(teamlead.sub);
    expect(ev.id).toBe(result.eventId);

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('§8.4 assignToEmployee — optional reason (B2)', () => {
  it('assigns WITHOUT a reason and still writes the audit event (reason null)', async () => {
    const beleg = await ready('WE-A4');
    const result = await teamleadSvc.assignToEmployee(
      teamlead,
      'ma-201',
      { caseId: beleg.id },
      NOW,
    );

    expect(result.caseStatus).toBe('assigned');
    expect(result.eventId).toBeTruthy();

    const ev = await prisma.workflowEvent.findUniqueOrThrow({
      where: { id: result.eventId! },
    });
    expect(ev.eventType).toBe('assignment.overridden');
    const payload = ev.payload as Record<string, unknown>;
    expect(payload['action']).toBe('manual_assign');
    expect(payload['reason']).toBeNull();
    expect(payload['caseId']).toBe(beleg.id);

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('PoolItemDto.bereich', () => {
  it('derives bereich from the Beleg location kind (regal → Regal)', async () => {
    const pool = await read.listPool({ status: 'ready' });
    const item = pool.items.find((i) => i.weBelegNo === 'WE-A5')!;
    expect(item.bereich).toBe('Regal');
  });
});

describe('„+"-Slot: newPack = vorgeplantes nächstes Pack — die Automatik lässt es stehen', () => {
  let vorgeplant!: { bundleId: string; packIndex: number };

  it('legt den Beleg als eigenes, NICHT aktives Pack ins bestehende Bündel (kein Zweit-Bündel)', async () => {
    const loc = await prisma.location.findFirstOrThrow({ select: { id: true } });
    const np = await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'assign-newpack',
        weBelegNo: 'WE-NP1',
        bookingDate: asDay(DATE),
        branchNo: '1',
        storageLocationId: loc.id,
        section: 7,
        totalQuantity: 20,
        status: 'ready',
        effortPoints: 8,
        estimatedMinutes: 20,
      },
    });

    const openBefore = await prisma.assignmentBundle.findMany({
      where: { employee: { employeeNo: 'ma-202' }, status: { notIn: ['completed', 'cancelled'] } },
      include: { items: true },
    });
    expect(openBefore).toHaveLength(1);
    const maxPackBefore = Math.max(...openBefore[0]!.items.map((i) => i.packIndex));

    const result = await teamleadSvc.assignToEmployee(
      teamlead,
      'ma-202',
      { caseId: np.id, date: DATE, newPack: true, reason: 'Fürs nächste Pack vorplanen' },
      NOW,
    );
    expect(result.bundleCreated).toBe(false);
    expect(result.bundleId).toBe(openBefore[0]!.id);

    // Weiterhin genau EIN offenes Bündel — die Invariante, die /api/me/today trägt:
    // ein paralleles Zweit-Bündel verschattete dort das aktive Pack des MA.
    const openAfter = await prisma.assignmentBundle.findMany({
      where: { employee: { employeeNo: 'ma-202' }, status: { notIn: ['completed', 'cancelled'] } },
    });
    expect(openAfter).toHaveLength(1);

    // Eigenes Pack HINTER den bestehenden, als Teamlead-Platzierung markiert; das
    // aktive Pack rückt NICHT vor — der MA sieht das Pack erst nach seinem Pull.
    const item = await prisma.assignmentItem.findFirstOrThrow({ where: { caseId: np.id } });
    expect(item.bundleId).toBe(openBefore[0]!.id);
    expect(item.packIndex).toBe(maxPackBefore + 1);
    expect(item.createdBy).toBe('teamlead');
    const bundleAfter = await prisma.assignmentBundle.findUniqueOrThrow({
      where: { id: item.bundleId },
    });
    expect(bundleAfter.activePackIndex).toBe(openBefore[0]!.activePackIndex);

    vorgeplant = { bundleId: item.bundleId, packIndex: item.packIndex };
  });

  it('recalculate räumt die Teamlead-Platzierung NICHT ab — die Automatik plant drumherum', async () => {
    await assignment.recalculate(teamlead, DATE, NOW);

    // Der vorgeplante Beleg liegt unverändert in SEINEM Pack desselben Bündels …
    const np = await prisma.goodsReceiptCase.findFirstOrThrow({ where: { weBelegNo: 'WE-NP1' } });
    expect(np.status).toBe('assigned');
    expect(np.assignedBundleId).toBe(vorgeplant.bundleId);
    const item = await prisma.assignmentItem.findFirstOrThrow({ where: { caseId: np.id } });
    expect(item.packIndex).toBe(vorgeplant.packIndex);
    expect(item.createdBy).toBe('teamlead');

    // … und ma-202 hat weiterhin genau EIN offenes Bündel: die Engine hängt ihre
    // neue Planung als Folge-Pack an, statt ein paralleles Bündel zu erzeugen.
    const open = await prisma.assignmentBundle.findMany({
      where: { employee: { employeeNo: 'ma-202' }, status: { notIn: ['completed', 'cancelled'] } },
    });
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe(vorgeplant.bundleId);

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('Automatik-Sperre: das angefasste bzw. gezogene aktive Pack bleibt stehen', () => {
  /** Mitarbeiter + Bündel mit vorgegebenen Packs/Status — direkt in der DB. */
  async function seedEmployeeBundle(
    employeeNo: string,
    activePackIndex: number,
    packs: { packIndex: number; weBelegNo: string; status: 'assigned' | 'completed' }[],
  ): Promise<{ bundleId: string; itemIdByWe: Map<string, string> }> {
    const emp = await prisma.user.create({
      data: { employeeNo, displayName: employeeNo, bereiche: ['Regal'] },
    });
    await prisma.shift.create({
      data: {
        employeeId: emp.id,
        date: asDay(DATE),
        plannedStart: new Date(`${DATE}T07:00:00.000Z`),
        plannedEnd: new Date(`${DATE}T15:00:00.000Z`),
        plannedHours: 8,
        netCapacityMinutes: 480,
      },
    });
    const loc = await prisma.location.findFirstOrThrow({ select: { id: true } });
    const bundle = await prisma.assignmentBundle.create({
      data: {
        employeeId: emp.id,
        date: asDay(DATE),
        status: 'assigned',
        createdBy: 'system',
        plannedEffortMinutes: packs.length * 20,
        activePackIndex,
      },
    });
    const itemIdByWe = new Map<string, string>();
    for (const [seq, p] of packs.entries()) {
      const c = await prisma.goodsReceiptCase.create({
        data: {
          source: 'manual',
          externalRef: 'lock-test',
          weBelegNo: p.weBelegNo,
          bookingDate: asDay(DATE),
          branchNo: '1',
          storageLocationId: loc.id,
          section: 7,
          totalQuantity: 20,
          status: p.status,
          effortPoints: 8,
          estimatedMinutes: 20,
          assignedBundleId: bundle.id,
        },
      });
      const item = await prisma.assignmentItem.create({
        // createdBy default `system` — genau die Engine-Platzierung, um die es geht.
        data: { bundleId: bundle.id, caseId: c.id, sequence: seq, packIndex: p.packIndex },
      });
      itemIdByWe.set(p.weBelegNo, item.id);
    }
    return { bundleId: bundle.id, itemIdByWe };
  }

  it('angefasstes aktives Pack: der unbegonnene Rest wird NICHT abgeräumt', async () => {
    // Pack 0 ist angefangen (ein Beleg fertig) — der zweite, noch unbegonnene
    // Beleg ist das laufende Pensum des MA und für die Automatik tabu.
    const { bundleId, itemIdByWe } = await seedEmployeeBundle('ma-204', 0, [
      { packIndex: 0, weBelegNo: 'WE-LOCK-DONE', status: 'completed' },
      { packIndex: 0, weBelegNo: 'WE-LOCK-REST', status: 'assigned' },
    ]);

    await assignment.recalculate(teamlead, DATE, NOW);

    // Dasselbe Item liegt unverändert da — nicht ein von der Engine neu erzeugtes.
    const rest = await prisma.assignmentItem.findFirstOrThrow({
      where: { case: { weBelegNo: 'WE-LOCK-REST' } },
    });
    expect(rest.id).toBe(itemIdByWe.get('WE-LOCK-REST'));
    expect(rest.bundleId).toBe(bundleId);
    expect(rest.packIndex).toBe(0);
    const c = await prisma.goodsReceiptCase.findFirstOrThrow({
      where: { weBelegNo: 'WE-LOCK-REST' },
    });
    expect(c.status).toBe('assigned');
    expect(c.assignedBundleId).toBe(bundleId);
  });

  it('selbst gezogenes Pack (activePackIndex > 0): auch unberührt bleibt es stehen', async () => {
    // Der MA hat sich Pack 1 per Pull geholt (Pull-Prinzip) — auch wenn er noch
    // nichts angefasst hat, ist das SEIN angefordertes Pensum.
    const { bundleId, itemIdByWe } = await seedEmployeeBundle('ma-205', 1, [
      { packIndex: 0, weBelegNo: 'WE-PULL-DONE', status: 'completed' },
      { packIndex: 1, weBelegNo: 'WE-PULL-FRESH', status: 'assigned' },
    ]);

    await assignment.recalculate(teamlead, DATE, NOW);

    const fresh = await prisma.assignmentItem.findFirstOrThrow({
      where: { case: { weBelegNo: 'WE-PULL-FRESH' } },
    });
    expect(fresh.id).toBe(itemIdByWe.get('WE-PULL-FRESH'));
    expect(fresh.bundleId).toBe(bundleId);
    expect(fresh.packIndex).toBe(1);
  });
});
