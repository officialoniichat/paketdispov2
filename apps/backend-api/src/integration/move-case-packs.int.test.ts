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
import type { BoardRowDto } from '../cases/cases.dto.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * B2 „Beleg verschieben" MIT Pack-Ziel gegen ein echtes Postgres (Testcontainers) —
 * die beiden Richtungen des DA.M.B-Umhängens: von Pack zu Pack DESSELBEN Bündels und
 * mitarbeiterübergreifend in ein bestimmtes Ziel-Pack. Geprüft wird die ganze Kette:
 * Abhol-Reihenfolge (AssignmentItem.sequence), Aufwand beider Bündel und die
 * Pack-Zuordnung, wie sie das Board danach ausliefert. Dazu die §7.1-Ausnahme:
 * laufende Arbeit ist unantastbar.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-20';
const NOW = new Date(`${DATE}T08:00:00.000Z`);
const day = new Date(`${DATE}T00:00:00.000Z`);

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
let readSvc: TeamleadReadService;

/** caseId je WE-Nummer — die Tests verlassen sich nie auf Einfüge-Reihenfolge. */
const ids = new Map<string, string>();
const id = (weBelegNo: string): string => {
  const found = ids.get(weBelegNo);
  if (found === undefined) throw new Error(`unbekannter Beleg ${weBelegNo}`);
  return found;
};

/**
 * Legt ein Bündel mit Packs an, wie die Engine es täte: die Items flach in der
 * Abhol-Reihenfolge, die Pack-Grenze persistiert am Item (`packIndex`). Die
 * `bundle.created`/`bundle.extended`-Events schreibt die Engine weiterhin mit —
 * sie dokumentieren die Planung, entscheiden die Zugehörigkeit aber nicht.
 */
async function seedBundle(employeeId: string, packs: string[][]): Promise<string> {
  const flat = packs.flat();
  const packOf = new Map(
    packs.flatMap((pack, packIndex) => pack.map((we) => [we, packIndex] as const)),
  );
  const bundle = await prisma.assignmentBundle.create({
    data: {
      employeeId,
      date: day,
      status: 'assigned',
      createdBy: 'system',
      plannedEffortMinutes: flat.length * 15,
    },
  });
  for (const [index, weBelegNo] of flat.entries()) {
    await prisma.assignmentItem.create({
      data: {
        bundleId: bundle.id,
        caseId: id(weBelegNo),
        sequence: index,
        packIndex: packOf.get(weBelegNo)!,
      },
    });
    await prisma.goodsReceiptCase.update({
      where: { id: id(weBelegNo) },
      data: { status: 'assigned', assignedBundleId: bundle.id },
    });
  }
  for (const [index, pack] of packs.entries()) {
    await events.append({
      eventType: index === 0 ? 'bundle.created' : 'bundle.extended',
      entityType: 'AssignmentBundle',
      entityId: bundle.id,
      actorType: 'system',
      actorId: teamlead.sub,
      payload: { caseIds: pack.map(id), effortPoints: pack.length * 4 },
    });
  }
  return bundle.id;
}

/** Abhol-Reihenfolge eines Bündels als WE-Nummern. */
async function order(bundleId: string): Promise<string[]> {
  const items = await prisma.assignmentItem.findMany({
    where: { bundleId },
    orderBy: { sequence: 'asc' },
    include: { case: { select: { weBelegNo: true } } },
  });
  // Lückenlos durchnummeriert — sonst stimmt die Reihenfolge nur zufällig.
  expect(items.map((i) => i.sequence)).toEqual(items.map((_, i) => i));
  return items.map((i) => i.case.weBelegNo);
}

/** Pack-Zuordnung, wie das Board sie ausliefert (WE-Nummern je Pack). */
async function boardPacks(employeeNo: string): Promise<string[][]> {
  const row = await boardRow(employeeNo);
  const byId = new Map(row.cases.map((c) => [c.id, c.weBelegNo]));
  return row.packs.map((p) => p.caseIds.map((cid) => byId.get(cid) ?? cid));
}

/** Die Board-Zeile eines Mitarbeiters — für Zusagen über die Pack-Indizes selbst. */
async function boardRow(employeeNo: string): Promise<BoardRowDto> {
  const board = await readSvc.board(DATE);
  const row = board.rows.find((r) => r.employeeNo === employeeNo);
  if (row === undefined) throw new Error(`keine Board-Zeile für ${employeeNo}`);
  return row;
}

let annaBundle: string;
let berndBundle: string;

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
  teamleadSvc = new TeamleadService(
    p,
    new WorkflowService(p, events),
    events,
    new LiveStatusService(),
  );
  readSvc = new TeamleadReadService(p);

  const anna = await prisma.user.create({
    data: { employeeNo: 'ma-401', displayName: 'Anna', bereiche: ['Regal'] },
  });
  const bernd = await prisma.user.create({
    data: { employeeNo: 'ma-402', displayName: 'Bernd', bereiche: ['Regal'] },
  });
  await prisma.user.create({ data: { employeeNo: 'tl-001', displayName: 'TL' } });
  const loc = await prisma.location.create({
    data: { code: 'R41', displayName: 'Regal 41', kind: 'regal', sequenceIndex: 41 },
  });
  for (const emp of [anna, bernd]) {
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
  // Je 15 Minuten → die Aufwandssummen sind exakt nachrechenbar.
  for (const weBelegNo of ['WE-A1', 'WE-A2', 'WE-A3', 'WE-A4', 'WE-B1', 'WE-B2', 'WE-B3']) {
    const row = await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'pack-move',
        weBelegNo,
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
    ids.set(weBelegNo, row.id);
  }

  // Anna: Pack 0 = A1/A2, Pack 1 = A3/A4 · Bernd: Pack 0 = B1/B2, Pack 1 = B3.
  annaBundle = await seedBundle(anna.id, [
    ['WE-A1', 'WE-A2'],
    ['WE-A3', 'WE-A4'],
  ]);
  berndBundle = await seedBundle(bernd.id, [['WE-B1', 'WE-B2'], ['WE-B3']]);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('B2 moveCase mit Pack-Ziel — innerhalb EINES Mitarbeiters', () => {
  it('hängt den Beleg ins Folge-Pack um: Reihenfolge, Aufwand und Pack-Zuordnung stimmen', async () => {
    expect(await boardPacks('ma-401')).toEqual([
      ['WE-A1', 'WE-A2'],
      ['WE-A3', 'WE-A4'],
    ]);

    const result = await teamleadSvc.moveCase(
      teamlead,
      annaBundle,
      id('WE-A1'),
      { targetEmployeeNo: 'ma-401', targetPackIndex: 1, reason: 'Reihenfolge anpassen' },
      NOW,
    );

    expect(result.bundleId).toBe(annaBundle);
    expect(result.bundleCreated).toBe(false);
    expect(result.caseStatus).toBe('assigned');
    // Der Beleg bleibt im Bündel — der Aufwand darf sich NICHT ändern.
    expect(result.plannedEffortMinutes).toBe(60);

    // Abhol-Reihenfolge folgt: A1 sitzt jetzt hinter dem letzten Pack-1-Mitglied.
    expect(await order(annaBundle)).toEqual(['WE-A2', 'WE-A3', 'WE-A4', 'WE-A1']);
    expect(await boardPacks('ma-401')).toEqual([['WE-A2'], ['WE-A3', 'WE-A4', 'WE-A1']]);

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('lehnt das Ziel-Pack ab, in dem der Beleg schon liegt (409)', async () => {
    await expect(
      teamleadSvc.moveCase(
        teamlead,
        annaBundle,
        id('WE-A1'),
        { targetEmployeeNo: 'ma-401', targetPackIndex: 1 },
        NOW,
      ),
    ).rejects.toThrow(/bereits in diesem Pack/i);
  });

  it('ohne Pack-Ziel bleibt derselbe Mitarbeiter ein ungültiges Ziel (409)', async () => {
    await expect(
      teamleadSvc.moveCase(teamlead, annaBundle, id('WE-A2'), { targetEmployeeNo: 'ma-401' }, NOW),
    ).rejects.toThrow(/identisch/i);
  });

  it('ein Pack, das es nicht gibt, ist eine veraltete Board-Sicht (400)', async () => {
    await expect(
      teamleadSvc.moveCase(
        teamlead,
        annaBundle,
        id('WE-A2'),
        { targetEmployeeNo: 'ma-401', targetPackIndex: 9 },
        NOW,
      ),
    ).rejects.toThrow(/veraltet/i);
  });
});

describe('B2 moveCase mit Pack-Ziel — mitarbeiterübergreifend', () => {
  it('setzt den Beleg in das Ziel-Pack des anderen Mitarbeiters, nicht ans Bündel-Ende', async () => {
    const result = await teamleadSvc.moveCase(
      teamlead,
      annaBundle,
      id('WE-A2'),
      { targetEmployeeNo: 'ma-402', targetPackIndex: 0, reason: 'Auslastung ausgleichen' },
      NOW,
    );

    expect(result.bundleId).toBe(berndBundle);
    expect(result.bundleCreated).toBe(false);
    // Bernd hatte 3 × 15, bekommt einen Beleg dazu.
    expect(result.plannedEffortMinutes).toBe(60);

    // Ziel-Pack 0 endet nach WE-B2 — der Beleg landet VOR dem Folge-Pack.
    expect(await order(berndBundle)).toEqual(['WE-B1', 'WE-B2', 'WE-A2', 'WE-B3']);
    expect(await boardPacks('ma-402')).toEqual([['WE-B1', 'WE-B2', 'WE-A2'], ['WE-B3']]);

    // Quell-Bündel: kein Geister-Beleg, lückenlose Reihenfolge, Aufwand gesunken.
    expect(await order(annaBundle)).toEqual(['WE-A3', 'WE-A4', 'WE-A1']);
    // Annas Pack 0 ist leergelaufen: es liefert keinen (leeren) Kasten mehr aus.
    // Sein Nachbar behält trotzdem Index 1 — der ist persistiert, nicht die
    // Position in dieser Liste. Ein gemerktes Pack-Ziel zeigt also weiter richtig.
    expect(await boardPacks('ma-401')).toEqual([['WE-A3', 'WE-A4', 'WE-A1']]);
    expect((await boardRow('ma-401')).packs.map((p) => p.index)).toEqual([1]);
    const source = await prisma.assignmentBundle.findUniqueOrThrow({ where: { id: annaBundle } });
    expect(source.plannedEffortMinutes).toBe(45);

    const moved = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: id('WE-A2') } });
    expect(moved.assignedBundleId).toBe(berndBundle);
    expect(moved.status).toBe('assigned');

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });
});

describe('§7.1 — laufende Arbeit ist unantastbar', () => {
  it('verweigert das Umhängen eines gestarteten Belegs (409)', async () => {
    await prisma.goodsReceiptCase.update({
      where: { id: id('WE-A3') },
      data: { status: 'in_progress' },
    });

    // Weder ins andere Pack desselben Mitarbeiters …
    await expect(
      teamleadSvc.moveCase(
        teamlead,
        annaBundle,
        id('WE-A3'),
        { targetEmployeeNo: 'ma-401', targetPackIndex: 0 },
        NOW,
      ),
    ).rejects.toThrow(/assigned/i);
    // … noch zu einem anderen Mitarbeiter.
    await expect(
      teamleadSvc.moveCase(
        teamlead,
        annaBundle,
        id('WE-A3'),
        { targetEmployeeNo: 'ma-402', targetPackIndex: 0 },
        NOW,
      ),
    ).rejects.toThrow(/assigned/i);

    // Nichts ist passiert: der Beleg liegt unverändert in seinem Pack.
    expect(await order(annaBundle)).toEqual(['WE-A3', 'WE-A4', 'WE-A1']);
  });
});
