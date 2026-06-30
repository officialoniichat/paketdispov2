import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * Idempotency guard for the teamlead "Neu berechnen" button (§8.3, Anhang E.5).
 * Running recalculate twice for the SAME date must succeed both times and must
 * not duplicate/leak AssignmentItems despite the @@unique([caseId]) constraint.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

// recalculate() materialises each active employee's shift from their weeklyPattern and
// DELETES any shift for a pattern-less day, so a raw shift.create alone yields no capacity.
// The seed therefore sets a full working week (mirrors the me-next-bundle/board convention).
const WORK_DAY = { working: true, start: '08:00', end: '16:00', breakMinutes: 30, partTimePct: 100 };
const WORKING_WEEK = {
  sun: WORK_DAY,
  mon: WORK_DAY,
  tue: WORK_DAY,
  wed: WORK_DAY,
  thu: WORK_DAY,
  fri: WORK_DAY,
  sat: WORK_DAY,
};

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let events: EventLogService;
let assignment: AssignmentService;

async function seed(): Promise<{ employeeId: string; caseIds: string[] }> {
  // Wochenplan mitseeden: recalculate materialisiert Schichten aus dem Pattern und
  // löscht sonst die manuell angelegte Schicht (bekanntes Verhalten, s. board.int).
  const work = { working: true, start: '06:00', end: '14:00', breakMinutes: 0, partTimePct: 100 };
  const weeklyPattern = {
    mon: work, tue: work, wed: work, thu: work, fri: work, sat: work, sun: work,
  };
  const emp = await prisma.user.create({
    data: { employeeNo: 'E100', displayName: 'Anna Beispiel', weeklyPattern },
  });
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
        externalRef: 'recalc-set-1',
        // Weit auseinanderliegende Nummern: sonst erkennt die T3-Beleglauf-Heuristik
        // die Fixtures als vermutete Lieferung und hält sie aus dem Pool zurück.
        weBelegNo: `WE-RECALC-${i * 100}`,
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
  assignment = new AssignmentService(p, events);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('recalculate idempotency (§8.3 Neu berechnen)', () => {
  it('runs twice for the same date without P2002 and without duplicating items', async () => {
    const { caseIds } = await seed();

    const first = await assignment.recalculate(teamlead, undefined, SHIFT_NOW);
    expect(first.bundleCount).toBeGreaterThan(0);
    expect(first.assignedCaseCount).toBe(caseIds.length);

    // SECOND run for the same date must not throw (was P2002 on AssignmentItem.caseId).
    const second = await assignment.recalculate(teamlead, undefined, SHIFT_NOW);
    expect(second.bundleCount).toBeGreaterThan(0);
    expect(second.assignedCaseCount).toBe(caseIds.length);

    // No leaked/duplicated items: exactly one item per assigned case.
    const itemCount = await prisma.assignmentItem.count();
    expect(itemCount).toBe(second.assignedCaseCount);

    // Prior bundles were cleared, only the latest plan survives.
    const bundleCount = await prisma.assignmentBundle.count();
    expect(bundleCount).toBe(second.bundleCount);

    // All seeded cases are still assigned to a surviving bundle.
    const rows = await prisma.goodsReceiptCase.findMany({ where: { id: { in: caseIds } } });
    expect(rows.every((c) => c.status === 'assigned')).toBe(true);
    expect(rows.every((c) => c.assignedBundleId !== null)).toBe(true);

    // Append-only audit log preserved: events from both runs survive, chain intact.
    const createdEv = await prisma.workflowEvent.count({ where: { eventType: 'bundle.created' } });
    expect(createdEv).toBe(first.bundleCount + second.bundleCount);
    expect((await events.verifyIntegrity()).ok).toBe(true);
  });

  it('leaves in_progress / non-ready cases untouched on recalc', async () => {
    // Mark one already-assigned case as in-flight; recalc must not steal it back.
    const inFlight = await prisma.goodsReceiptCase.findFirstOrThrow({ where: { status: 'assigned' } });
    const keptBundleId = inFlight.assignedBundleId;
    await prisma.goodsReceiptCase.update({
      where: { id: inFlight.id },
      data: { status: 'in_progress' },
    });

    await assignment.recalculate(teamlead, undefined, SHIFT_NOW);

    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({ where: { id: inFlight.id } });
    expect(row.status).toBe('in_progress');
    expect(row.assignedBundleId).toBe(keptBundleId);

    // Its bundle/item must survive (not deleted by the cleanup).
    const item = await prisma.assignmentItem.findFirst({ where: { caseId: inFlight.id } });
    expect(item).not.toBeNull();
  });
});

/**
 * Regression for the production 500: POST /teamlead/assignments/recalculate threw
 * `PrismaClientKnownRequestError P2002 — Unique constraint failed on (caseId)` inside
 * AssignmentService.persistBundle.
 *
 * Root cause: a case can be back in the `ready` pool while STILL owning an AssignmentItem
 * from an earlier plan. The §7.1 `partially_completed → ready` reactivation (and every
 * other workflow transition) only flips the case status — it never unlinks the bundle or
 * drops the item (workflow.service.transition updates `status` alone). clearPriorPlanForDate
 * keeps that bundle because it is still "referenced" (assignedBundleId set) and never reverts
 * the case (it is no longer `assigned`), so the stale item survives. The next recalculate
 * re-plans the case and persistBundle creates a SECOND item for the same caseId → P2002.
 *
 * The dataset mirrors the live pool (≈15 free + 1 overdue, with a delivery group) and seeds
 * exactly that stranded state. The first recalculate below threw P2002 before the fix.
 */
const DAY = todayMidnightUtc().toISOString().slice(0, 10);
// now = shift start (local, matching the materialised plannedStart) so the whole pre-cutoff
// window is auto-assignable and every seeded case lands in a bundle.
const RECALC_NOW = new Date(`${DAY}T08:00:00`);

async function resetAll(): Promise<void> {
  await prisma.assignmentItem.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.zstRecord.deleteMany();
  await prisma.goodsReceiptCase.deleteMany();
  await prisma.assignmentBundle.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.location.deleteMany();
  await prisma.workflowEvent.deleteMany();
  await prisma.user.deleteMany();
}

interface StrandedSeed {
  poolCaseIds: string[];
  strandedCaseId: string;
}

async function seedStrandedPool(): Promise<StrandedSeed> {
  const day = todayMidnightUtc();
  const yesterday = new Date(day.getTime() - 86_400_000);

  // Two employees with a working pattern; recalculate materialises their shift from it
  // (a raw shift.create would be wiped by materializeShiftsForDate when the pattern is null).
  const e1 = await prisma.user.create({
    data: { employeeNo: 'SP-1', displayName: 'MA SP-1', bereiche: ['Regal'], productivityFactor: 1, weeklyPattern: WORKING_WEEK },
  });
  await prisma.user.create({
    data: { employeeNo: 'SP-2', displayName: 'MA SP-2', bereiche: ['Regal'], productivityFactor: 1, weeklyPattern: WORKING_WEEK },
  });
  const loc = await prisma.location.create({
    data: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });

  const makeCase = async (i: number, extra: Record<string, unknown> = {}): Promise<string> => {
    const c = await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: 'p2002-set',
        weBelegNo: `WE-P2002-${(i + 1) * 10}`, // numeric gap of 10 → never a T3 run group
        bookingDate: day,
        branchNo: '1',
        storageLocationId: loc.id,
        section: 7,
        totalQuantity: 10,
        status: 'ready',
        effortPoints: 5,
        estimatedMinutes: 15,
        ...extra,
      },
    });
    return c.id;
  };

  const poolCaseIds: string[] = [];
  // 3-case CONFIRMED delivery group (shared source key → distributed, not withheld).
  for (let i = 0; i < 3; i += 1) {
    poolCaseIds.push(await makeCase(i, { deliverySourceGroupKey: 'LS-A', deliverySourceGroupSize: 3 }));
  }
  // 12 further plain free cases → 15 free total.
  for (let i = 3; i < 15; i += 1) {
    poolCaseIds.push(await makeCase(i));
  }
  // 1 overdue case (booked before today → starter-package path).
  poolCaseIds.push(await makeCase(15, { bookingDate: yesterday }));

  // Strand one plain free case: it is `ready` (in the pool) yet still owns an AssignmentItem
  // in a kept bundle — the exact residue a `partially_completed → ready` reactivation leaves.
  const strandedCaseId = poolCaseIds[5]!;
  const priorBundle = await prisma.assignmentBundle.create({
    data: { employeeId: e1.id, date: day, status: 'assigned', createdBy: 'system', plannedEffortMinutes: 15 },
  });
  await prisma.assignmentItem.create({
    data: { bundleId: priorBundle.id, caseId: strandedCaseId, sequence: 0 },
  });
  await prisma.goodsReceiptCase.update({
    where: { id: strandedCaseId },
    data: { assignedBundleId: priorBundle.id }, // status stays `ready`
  });

  return { poolCaseIds, strandedCaseId };
}

describe('recalculate idempotency — stranded AssignmentItem (P2002 regression)', () => {
  let seed: StrandedSeed;

  beforeAll(async () => {
    await resetAll();
    seed = await seedStrandedPool();
  });

  it('recalculates twice without P2002 and never assigns a caseId to two bundles', async () => {
    // Pre-fix this FIRST call threw Prisma P2002 (unique constraint on AssignmentItem.caseId),
    // because the stranded case is re-planned while its old item still exists.
    const first = await assignment.recalculate(teamlead, DAY, RECALC_NOW);
    expect(first.assignedCaseCount).toBeGreaterThan(0);

    // Re-run for the same date must also succeed and stay stable (idempotent).
    const second = await assignment.recalculate(teamlead, DAY, RECALC_NOW);
    expect(second.assignedCaseCount).toBe(first.assignedCaseCount);

    // INVARIANT: no caseId belongs to more than one AssignmentItem (never two bundles).
    const items = await prisma.assignmentItem.findMany({ select: { caseId: true } });
    const perCase = new Map<string, number>();
    for (const it of items) perCase.set(it.caseId, (perCase.get(it.caseId) ?? 0) + 1);
    const duplicated = [...perCase.entries()].filter(([, n]) => n > 1);
    expect(duplicated).toEqual([]);

    // Exactly one item per assigned case (no leaked/duplicated rows).
    expect(items.length).toBe(second.assignedCaseCount);

    // The previously-stranded case is now linked to exactly one bundle and is `assigned`.
    expect(perCase.get(seed.strandedCaseId) ?? 0).toBe(1);
    const strandedRow = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: seed.strandedCaseId },
    });
    expect(strandedRow.status).toBe('assigned');
    expect(strandedRow.assignedBundleId).not.toBeNull();
  });
});
