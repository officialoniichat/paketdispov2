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
import { ClockService } from '../clock/clock.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * POST /api/me/next-bundle — „nächstes Pack anfordern" (Pull-Prinzip).
 *
 * Der Mitarbeiter arbeitet genau EIN Pack ab und fordert dann das nächste an.
 * Solange im aktiven Pack eigene Arbeit offen ist, antwortet der Guard mit
 * `pack_open`; Belege mit noch offenem Problem zählen dabei nicht mit (sie hängen
 * an der Teamleitung). Ist bereits ein Folge-Pack vorgeplant, wird es nur
 * freigeschaltet — sonst zieht die Engine ein frisches aus dem Pool und hängt es
 * als neues Pack ans offene Bündel. Ein leerer Pool / keine Schicht liefern
 * weiterhin ihren jeweiligen Grund. Shifts are derived from the weekly pattern
 * (assignNextBundle materializes them), so the seed sets a working pattern rather
 * than a raw shift.
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

/** Put fresh Belege into the ready pool (the pull empties it) and return their ids. */
async function addReadyCases(count: number, tag: string): Promise<string[]> {
  const day = today();
  const loc = await prisma.location.findFirstOrThrow({ where: { code: 'R1' } });
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const created = await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: `nb-${tag}-${i}`,
        weBelegNo: `WE-NB-${tag}-${i}`,
        bookingDate: day,
        branchNo: '1',
        storageLocationId: loc.id,
        section: 1,
        totalQuantity: 3,
        status: 'ready',
        effortPoints: 5,
        estimatedMinutes: 10,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
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
  cases = new CasesService(
    p,
    new WorkflowService(p, events),
    events,
    new LiveStatusService(),
    new ClockService(p),
  );
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('POST /api/me/next-bundle (Pull-on-idle)', () => {
  it('assigns one Folge-Pack from the ready pool (Teile-Budget, bound to the worker)', async () => {
    await reset(8);
    const res = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(res.assigned).toBe(true);
    // 8 ready × 3 Teile = 24 Teile — unter dem Folge-Pack-Minimum (80), also passt
    // der ganze Pool in EIN Pack (keine Beleg-Obergrenze mehr, C2).
    expect(res.caseCount).toBe(8);

    expect(await prisma.goodsReceiptCase.count({ where: { status: 'assigned' } })).toBe(8);
    expect(await prisma.goodsReceiptCase.count({ where: { status: 'ready' } })).toBe(0);
  });

  it('blockt den nächsten Pull, solange im aktiven Pack eigene Arbeit offen ist', async () => {
    // Die 8 Belege des ersten Packs sind unangetastet (`assigned`) — Pull-Prinzip:
    // erst das laufende Pack, dann das nächste.
    await addReadyCases(3, 'blocked');
    const res = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(res).toMatchObject({ assigned: false, reason: 'pack_open' });
  });

  it('ein Beleg mit OFFENEM Problem blockiert den Pull nicht — er hängt am Teamlead', async () => {
    const before = await prisma.assignmentBundle.findFirstOrThrow({ where: { employeeId } });
    const items = await prisma.assignmentItem.findMany({
      where: { bundleId: before.id },
      orderBy: { sequence: 'asc' },
    });
    // Alles fertig AUSSER einem Beleg, der auf die Klärung wartet.
    const [problemItem, ...rest] = items;
    for (const item of rest) {
      await cases.startPreparation(owner, item.caseId);
      await cases.complete(owner, item.caseId);
    }
    await prisma.goodsReceiptCase.update({
      where: { id: problemItem!.caseId },
      data: { status: 'issue_open' },
    });

    const res = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(res).toMatchObject({ assigned: true, caseCount: 3 });

    // Ein einziges Bündel — das offene wächst um ein NEUES Pack, das sofort aktiv ist.
    expect(await prisma.assignmentBundle.count({ where: { employeeId } })).toBe(1);
    const after = await prisma.assignmentBundle.findFirstOrThrow({
      where: { id: before.id },
      include: { items: true, routeStops: true },
    });
    expect(after.items).toHaveLength(11);
    expect(after.activePackIndex).toBe(1);
    expect(after.plannedEffortMinutes).toBeGreaterThan(before.plannedEffortMinutes);
    // All new cases share location R1, which the bundle already visits — no duplicate stop.
    expect(new Set(after.routeStops.map((s) => s.locationCode)).size).toBe(
      after.routeStops.length,
    );

    // Der Problem-Beleg bleibt bei Pack 1 — keine Umbuchung ins neue Pack.
    const problem = after.items.find((i) => i.caseId === problemItem!.caseId);
    expect(problem?.packIndex).toBe(0);

    const extended = await prisma.workflowEvent.findFirst({
      where: { eventType: 'bundle.extended', entityId: before.id },
    });
    expect(extended).not.toBeNull();
  });

  it('zeigt dem MA nur das aktive Pack — der Problem-Beleg aus Pack 1 bleibt sichtbar', async () => {
    const bundle = await prisma.assignmentBundle.findFirstOrThrow({ where: { employeeId } });
    const todayView = await cases.getToday(owner);

    expect(todayView.pack).toMatchObject({ index: 1, total: 2, caseCount: 3 });
    // Pack 2 (3 Belege) + der mitgenommene Problem-Beleg aus Pack 1; die fertigen
    // Belege aus Pack 1 sind raus.
    const visible = todayView.cases.map((c) => c.packIndex);
    expect(visible.filter((p) => p === 1)).toHaveLength(3);
    expect(visible.filter((p) => p === 0)).toHaveLength(1);

    const carried = todayView.cases.find((c) => c.packIndex === 0);
    expect(carried?.status).toBe('issue_open');
    expect(bundle.activePackIndex).toBe(1);
  });

  it('schaltet ein bereits VORGEPLANTES Folge-Pack frei, statt neu zu planen', async () => {
    await reset(4);
    const first = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(first.assigned).toBe(true);

    // Planung hängt ein zweites Pack an — der MA sieht es noch nicht.
    const bundle = await prisma.assignmentBundle.findFirstOrThrow({ where: { employeeId } });
    const extraIds = await addReadyCases(2, 'geplant');
    for (const [i, caseId] of extraIds.entries()) {
      await prisma.assignmentItem.create({
        data: { bundleId: bundle.id, caseId, sequence: 4 + i, packIndex: 1 },
      });
      await prisma.goodsReceiptCase.update({
        where: { id: caseId },
        data: { status: 'assigned', assignedBundleId: bundle.id },
      });
    }
    const vorher = await cases.getToday(owner);
    expect(vorher.cases).toHaveLength(4);
    expect(vorher.pack).toMatchObject({ index: 0, total: 2 });

    // Pack 1 abarbeiten, dann anfordern: nichts wird neu geplant, das vorhandene
    // Pack 2 wird nur freigeschaltet.
    const packOne = await prisma.assignmentItem.findMany({
      where: { bundleId: bundle.id, packIndex: 0 },
    });
    for (const item of packOne) {
      await cases.startPreparation(owner, item.caseId);
      await cases.complete(owner, item.caseId);
    }
    const res = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    expect(res).toMatchObject({ assigned: true, caseCount: 2 });

    const after = await prisma.assignmentBundle.findFirstOrThrow({
      where: { id: bundle.id },
      include: { items: true },
    });
    expect(after.activePackIndex).toBe(1);
    // Kein neues Pack: es bleibt bei den 6 Items aus Planung + Vorplanung.
    expect(after.items).toHaveLength(6);
    const advanced = await prisma.workflowEvent.findFirst({
      where: { eventType: 'bundle.pack_advanced', entityId: bundle.id },
    });
    expect(advanced).not.toBeNull();
    expect(await cases.getToday(owner)).toMatchObject({ pack: { index: 1, total: 2 } });
  });

  it('completes the bundle when its last case is done, then the next pull works', async () => {
    // Eigener Ausgangszustand: EIN Pack, alles abarbeitbar (die Pack-Tests oben
    // hinterlassen bewusst einen offenen Problem-Beleg).
    await reset(3);
    expect((await assignment.assignNextBundle(owner, undefined, PULL_NOW)).assigned).toBe(true);
    await finishOwnersOpenCart();
    const firstBundle = await prisma.assignmentBundle.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'asc' },
    });
    expect(firstBundle?.status).toBe('completed');

    const next = await assignment.assignNextBundle(owner, undefined, PULL_NOW);
    // Der erste Pull hat den Pool geleert — es gibt nichts mehr zu ziehen.
    expect(next).toMatchObject({ assigned: false, reason: 'pool_empty' });
  });

  it('returns pool_empty when nothing is free', async () => {
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
