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

const SHIFT_NOW = new Date(`${todayMidnightUtc().toISOString().slice(0, 10)}T06:00:00.000Z`);

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

  const caseIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'itest-set-1',
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

    const result = await assignment.recalculate(teamlead, undefined, SHIFT_NOW);

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

/**
 * Self-contained Problemfall-Setup (unabhängig von der flakigen recalculate-
 * Zuteilung, die am dokumentierten materializeShiftsForDate-Shift-Bug hängt):
 * legt einen Beleg im Status `assigned` an, gebunden an ein Bündel des
 * Test-Mitarbeiters E100, mit einer Position und zwei Größenzeilen.
 */
async function seedAssignedCaseWithPositions(weBelegNo: string): Promise<{
  caseId: string;
  positionId: string;
  skuMId: string;
  skuLId: string;
}> {
  const emp = await prisma.user.upsert({
    where: { employeeNo: 'E100' },
    update: {},
    create: { employeeNo: 'E100', displayName: 'Anna Beispiel' },
  });
  const loc = await prisma.location.upsert({
    where: { code: 'R27' },
    update: {},
    create: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });
  const day = todayMidnightUtc();
  const bundle = await prisma.assignmentBundle.create({
    data: { employeeId: emp.id, date: day, status: 'assigned', createdBy: 'system' },
  });
  const gcase = await prisma.goodsReceiptCase.create({
    data: {
      source: 'manual',
      externalRef: `itest-problem:${weBelegNo}`,
      weBelegNo,
      bookingDate: day,
      branchNo: '1',
      storageLocationId: loc.id,
      section: 7,
      totalQuantity: 20,
      status: 'assigned',
      effortPoints: 10,
      estimatedMinutes: 20,
      assignedBundleId: bundle.id,
      positions: {
        create: {
          positionNo: 1,
          wgr: '218110',
          supplierArticleNo: 'ART-1',
          supplierColor: 'schwarz',
          branchNo: '1',
          shopNo: '0034',
          skuLines: {
            create: [
              { ean: '4000000000001', size: 'M', expectedQuantity: 12, vkLabelPrice: 19.99 },
              { ean: '4000000000002', size: 'L', expectedQuantity: 8, vkLabelPrice: 19.99 },
            ],
          },
        },
      },
    },
    include: { positions: { include: { skuLines: { orderBy: { ean: 'asc' } } } } },
  });
  const position = gcase.positions[0]!;
  return {
    caseId: gcase.id,
    positionId: position.id,
    skuMId: position.skuLines[0]!.id,
    skuLId: position.skuLines[1]!.id,
  };
}

describe('Problem-Loop (Kundenfeedback 14.07.2026 + §17.1 Problemfall)', () => {
  it('Teilabschluss mit Problemen → Teamlead-Klärung → Weiterbearbeitung → Abschluss', async () => {
    const { caseId, positionId, skuMId, skuLId } =
      await seedAssignedCaseWithPositions('WE-PROBLEM-1');
    const owned = { id: caseId };
    const skuM = { id: skuMId };
    const skuL = { id: skuLId };
    const position = { id: positionId };

    await cases.startPreparation(employee, owned.id); // assigned → in_progress

    // „Beleg erledigt" ist mit Abweichungen NICHT erlaubt (Punkt 7).
    await expect(
      cases.complete(employee, owned.id, {
        skuQuantities: [
          { skuLineId: skuM!.id, confirmedQuantity: 9 },
          { skuLineId: skuL!.id, confirmedQuantity: 8 },
        ],
      }),
    ).rejects.toThrowError(/Teilabschluss/);

    // Teilabschluss: Minderlieferung (implizit) + Preiskorrektur (implizit) + manuelles Problem.
    await cases.partialComplete(employee, owned.id, {
      skuQuantities: [
        { skuLineId: skuM!.id, confirmedQuantity: 9 },
        { skuLineId: skuL!.id, confirmedQuantity: 8, correctedVkPrice: 14.99 },
      ],
      problems: [
        { positionId: position.id, reasonId: 'pr_wrong_color', note: 'Farbe weicht ab' },
      ],
    });

    let row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: owned.id } });
    expect(row.status).toBe('issue_open'); // rot beim SELBEN MA geparkt

    const issues = await prisma.issue.findMany({ where: { caseId: owned.id } });
    expect(issues.map((i) => i.kind).sort()).toEqual([
      'manual',
      'price_deviation',
      'under_delivery',
    ]);
    const manual = issues.find((i) => i.kind === 'manual');
    expect(manual?.reasonLabel).toBe('falsche Farbe'); // Label-Snapshot aus dem Katalog
    const under = issues.find((i) => i.kind === 'under_delivery');
    expect(under?.deviationQty).toBe(-3);
    const price = issues.find((i) => i.kind === 'price_deviation');
    expect(price?.correctedVkPrice).toBe(14.99);

    // Ist-Mengen persistiert; abweichende Zeile trägt status=deviation.
    const persistedM = await prisma.receiptSkuLine.findUniqueOrThrow({ where: { id: skuM!.id } });
    expect(persistedM.confirmedQuantity).toBe(9);
    expect(persistedM.status).toBe('deviation');

    // Teil-ZST über die gezählte Menge (17 von 20).
    const partialZst = await prisma.zstRecord.findFirstOrThrow({ where: { caseId: owned.id } });
    expect(partialZst.completedQuantity).toBe(17);

    // Teamlead klärt ALLE Probleme auf einmal → grün beim selben MA.
    await teamleadSvc.resolveProblems(teamlead, owned.id, { resolution: 'Mit Filiale geklärt' });
    row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: owned.id } });
    expect(row.status).toBe('problem_resolved');
    const resolved = await prisma.issue.findMany({ where: { caseId: owned.id } });
    expect(resolved.every((i) => i.status === 'resolved')).toBe(true);
    expect(resolved.every((i) => i.releasedBy === teamlead.sub)).toBe(true);

    // Derselbe MA setzt fort (case.resumed) und schließt ab.
    await cases.startPreparation(employee, owned.id);
    row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: owned.id } });
    expect(row.status).toBe('in_progress');
    const resumedEv = await prisma.workflowEvent.findFirst({
      where: { entityId: owned.id, eventType: 'case.resumed' },
    });
    expect(resumedEv).not.toBeNull();

    await cases.complete(employee, owned.id, {
      skuQuantities: [
        { skuLineId: skuM!.id, confirmedQuantity: 12 },
        { skuLineId: skuL!.id, confirmedQuantity: 8 },
      ],
    });
    row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: owned.id } });
    expect(row.status).toBe('completed');

    // ZST bucht nur das Delta (20 gezählt − 17 bereits verbucht = 3): keine Doppelzählung.
    const zstRecords = await prisma.zstRecord.findMany({
      where: { caseId: owned.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(zstRecords.map((z) => z.completedQuantity)).toEqual([17, 3]);

    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('Teilabschluss OHNE Probleme wird abgelehnt (Beleg erledigt ist der richtige Weg)', async () => {
    const { caseId } = await seedAssignedCaseWithPositions('WE-PROBLEM-2');
    await cases.startPreparation(employee, caseId);
    await expect(
      cases.partialComplete(employee, caseId, { skuQuantities: [], problems: [] }),
    ).rejects.toThrowError(/mindestens ein Problem/);
  });
});

describe('ZST (§4.6 + §17.1 ZST)', () => {
  it('digital completion produces a correct ZST record + KPI basis', async () => {
    const { caseId } = await seedAssignedCaseWithPositions('WE-ZST-1');
    const owned = { id: caseId };
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
