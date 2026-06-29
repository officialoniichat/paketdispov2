import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_RULE_CONFIG, RULE_CONFIG_KEY } from '@paket/domain-types';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * Integration proof for the LIVE effort wiring (Teamlead-Punkt 2): a case that carries a
 * WorkInstructionHeader + PositionInstruction has its bundle effort recomputed by the
 * engine from the cockpit-edited parameters (computeEffort over the built EffortInputVector),
 * NOT taken from the precomputed estimatedMinutes — and a change to RuleConfig.effort flows
 * straight into the next recalculate.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';
const NOW = new Date(`${DATE}T07:00:00.000Z`);
/** Sentinel: if the engine ever used this instead of the vector, assertions catch it. */
const SENTINEL_MINUTES = 999;

const teamlead: Principal = { sub: 'oidc-tl-1', employeeNo: 'tl-001', roles: [Role.Teamlead], claims: {} };

function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

const FULL_DAY = { working: true, start: '07:00', end: '15:00', breakMinutes: 0, partTimePct: 100 };
const WEEK_PATTERN = { mon: FULL_DAY, tue: FULL_DAY, wed: FULL_DAY, thu: FULL_DAY, fri: FULL_DAY, sat: FULL_DAY, sun: FULL_DAY };

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let assignment: AssignmentService;

/**
 * One ready case at a regal location with a work instruction: 40 Teile, Etikettendruck,
 * quantity_only check, WGR 111130 (factor 1.0), no per-position drivers. Its TRUE effort is
 * base(3) + 40×0.35×1.0(14) + print(2) = 19 min — far from the SENTINEL estimatedMinutes.
 */
async function seed(): Promise<void> {
  await prisma.user.create({
    data: { employeeNo: 'ma-101', displayName: 'Anna', bereiche: ['regal'], weeklyPattern: WEEK_PATTERN },
  });
  await prisma.user.create({ data: { employeeNo: 'tl-001', displayName: 'TL' } });
  const loc = await prisma.location.create({
    data: { code: 'R27', displayName: 'Regal 27', kind: 'regal', sequenceIndex: 27 },
  });
  const c = await prisma.goodsReceiptCase.create({
    data: {
      source: 'manual',
      externalRef: 'effort-wire-1',
      weBelegNo: 'WE-EFFORT-1',
      bookingDate: asDate(DATE),
      branchNo: '1',
      storageLocationId: loc.id,
      section: 7,
      totalQuantity: 40,
      status: 'ready',
      effortPoints: SENTINEL_MINUTES,
      estimatedMinutes: SENTINEL_MINUTES,
    },
  });
  await prisma.workInstructionHeader.create({
    data: { caseId: c.id, priceLabelPrintRequired: true, goodsReceiptCheckMode: 'quantity_only' },
  });
  const pos = await prisma.receiptPosition.create({
    data: {
      caseId: c.id,
      positionNo: 1,
      wgr: '111130',
      supplierArticleNo: 'A-1',
      supplierColor: 'BLK',
      branchNo: '1',
      shopNo: '1',
    },
  });
  await prisma.positionInstruction.create({
    data: {
      positionId: pos.id,
      priceLabelAttachRequired: false,
      securityRequired: false,
      onlineHandlingRequired: false,
      redPriceRequired: false,
    },
  });
}

async function plannedMinutes(): Promise<number> {
  const bundle = await prisma.assignmentBundle.findFirst({
    where: { date: asDate(DATE) },
    select: { plannedEffortMinutes: true },
  });
  if (!bundle) throw new Error('expected a bundle after recalculate');
  return bundle.plannedEffortMinutes;
}

async function setPriceLabelPrintMinutes(value: number): Promise<void> {
  const value_ = {
    ...DEFAULT_RULE_CONFIG,
    effort: { ...DEFAULT_RULE_CONFIG.effort, priceLabelPrintMinutes: value },
  };
  await prisma.appConfig.upsert({
    where: { key: RULE_CONFIG_KEY },
    create: { key: RULE_CONFIG_KEY, value: value_ },
    update: { value: value_ },
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
  assignment = new AssignmentService(p, new EventLogService(p));
  await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('live effort wiring (§8.2 Teamlead-Punkt 2)', () => {
  it('recomputes bundle effort from the work instruction, not the precomputed estimatedMinutes', async () => {
    await assignment.recalculate(teamlead, DATE, NOW); // default config (print = 2 min)
    const planned = await plannedMinutes();
    // base 3 + 40×0.35 + print 2 = 19 — and crucially NOT the 999 sentinel.
    expect(planned).toBeCloseTo(19, 1);
    expect(planned).toBeLessThan(100);
  });

  it('does not overwrite the stored estimatedMinutes (documented boundary)', async () => {
    const row = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { weBelegNo: 'WE-EFFORT-1' },
      select: { estimatedMinutes: true },
    });
    expect(row.estimatedMinutes).toBe(SENTINEL_MINUTES);
  });

  it('reflects a cockpit effort change live: doubling print minutes adds exactly 2 min', async () => {
    await setPriceLabelPrintMinutes(2); // explicit baseline
    await assignment.recalculate(teamlead, DATE, NOW);
    const before = await plannedMinutes();

    await setPriceLabelPrintMinutes(4); // teamlead edits the parameter
    await assignment.recalculate(teamlead, DATE, NOW);
    const after = await plannedMinutes();

    expect(after - before).toBeCloseTo(2, 1);
  });
});
