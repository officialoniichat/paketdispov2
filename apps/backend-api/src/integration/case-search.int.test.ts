import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TeamleadReadService } from '../cases/teamlead-read.service.js';

/**
 * A1/A2/B1 assign-flow search: GET /api/teamlead/cases/search behind AssignDialog's
 * combobox + Durchsuchen drawer, driven directly against a real Postgres.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-20';

function asDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let read: TeamleadReadService;

async function seed(): Promise<void> {
  const regal = await prisma.location.create({
    data: { code: 'R41', displayName: 'Regal 41', kind: 'regal', sequenceIndex: 41 },
  });
  const palette = await prisma.location.create({
    data: { code: 'P41', displayName: 'Palette 41', kind: 'palette_a', sequenceIndex: 42 },
  });
  const day = asDay(DATE);
  const base = {
    source: 'manual' as const,
    externalRef: 'search-set-1',
    bookingDate: day,
    branchNo: '1',
    section: 7,
    totalQuantity: 10,
    effortPoints: 5,
    estimatedMinutes: 15,
  };

  // Exact-match target.
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-100', storageLocationId: regal.id, status: 'ready' },
  });
  // Starts-with match.
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-1005', storageLocationId: regal.id, status: 'ready' },
  });
  // Contains match (WE-Nr embeds the needle but doesn't start with it).
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'X-WE-SEARCH-100-Y', storageLocationId: regal.id, status: 'ready' },
  });
  // Other-field match only (primaryShopNo carries the needle, WE-Nr does not).
  await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      weBelegNo: 'WE-UNRELATED-1',
      primaryShopNo: 'SHOP-WE-SEARCH-100',
      storageLocationId: regal.id,
      status: 'ready',
    },
  });
  // Assignable in Palette bereich (for the bereich filter test).
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-PALETTE', storageLocationId: palette.id, status: 'ready' },
  });
  // Browse-ordering probe: three ready/unassigned Regal cases with DISTINCT
  // bookingDates (none equal to `DATE`, to avoid tie-break ambiguity against the
  // other seeded Regal rows above) so the no-`q` browse test has a real, known-
  // correct order to assert against instead of a vacuous self-comparison.
  await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      weBelegNo: 'WE-SEARCH-DATE-OLD',
      bookingDate: asDay('2026-06-17'),
      storageLocationId: regal.id,
      status: 'ready',
    },
  });
  await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      weBelegNo: 'WE-SEARCH-DATE-MID',
      bookingDate: asDay('2026-06-19'),
      storageLocationId: regal.id,
      status: 'ready',
    },
  });
  await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      weBelegNo: 'WE-SEARCH-DATE-NEW',
      bookingDate: asDay('2026-06-23'),
      storageLocationId: regal.id,
      status: 'ready',
    },
  });
  // Not ready (parked) — must never appear.
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-PARKED', storageLocationId: regal.id, status: 'parked' },
  });

  // Already assigned (ready status would be impossible in practice once assigned,
  // but assignedBundleId is the actual gate the endpoint checks) — must never appear.
  const held = await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-HELD', storageLocationId: regal.id, status: 'assigned' },
  });
  const employee = await prisma.user.create({
    data: { employeeNo: 'ma-401', displayName: 'Petra', bereiche: ['Regal'] },
  });
  const bundle = await prisma.assignmentBundle.create({
    data: { employeeId: employee.id, date: day, status: 'assigned', createdBy: 'system', plannedEffortMinutes: 15 },
  });
  await prisma.assignmentItem.create({ data: { bundleId: bundle.id, caseId: held.id, sequence: 0 } });
  await prisma.goodsReceiptCase.update({ where: { id: held.id }, data: { assignedBundleId: bundle.id } });
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
  read = new TeamleadReadService(prisma as unknown as PrismaService);
  await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('searchCases — assign-flow search + browse', () => {
  it('ranks exact WE-Nr match first, then starts-with, then contains, then other-field match', async () => {
    const results = await read.searchCases({ q: 'WE-SEARCH-100', limit: 10 });
    const weBelegNos = results.map((r) => r.weBelegNo);
    expect(weBelegNos.indexOf('WE-SEARCH-100')).toBe(0);
    expect(weBelegNos.indexOf('WE-SEARCH-1005')).toBeLessThan(weBelegNos.indexOf('X-WE-SEARCH-100-Y'));
    expect(weBelegNos.indexOf('X-WE-SEARCH-100-Y')).toBeLessThan(weBelegNos.indexOf('WE-UNRELATED-1'));
  });

  it('never returns non-ready or already-assigned Belege', async () => {
    const results = await read.searchCases({ q: 'WE-SEARCH', limit: 50 });
    const weBelegNos = results.map((r) => r.weBelegNo);
    expect(weBelegNos).not.toContain('WE-SEARCH-PARKED');
    expect(weBelegNos).not.toContain('WE-SEARCH-HELD');
  });

  it('filters by bereich', async () => {
    const results = await read.searchCases({ bereich: 'Palette', limit: 50 });
    expect(results.map((r) => r.weBelegNo)).toContain('WE-SEARCH-PALETTE');
    expect(results.every((r) => r.bereich === 'Palette')).toBe(true);
  });

  it('honors limit and caps it at 50 even if a caller requests more', async () => {
    const results = await read.searchCases({ limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);

    // `seed()` alone only produces ~9 ready/unassigned cases, so `overLimit.length
    // <= 50` would pass vacuously even if the cap were removed entirely. Seed a
    // pool well past 50 — scoped to a dedicated Palette-bereich location so it
    // cannot affect the Regal-scoped browse-ordering test that runs after this
    // one — then assert the count is EXACTLY 50, which only holds if the cap is
    // actually enforced against a bigger-than-50 candidate pool.
    const capLocation = await prisma.location.create({
      data: { code: 'CAP1', displayName: 'Cap-Test Palette', kind: 'palette_a', sequenceIndex: 99 },
    });
    await prisma.goodsReceiptCase.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({
        source: 'manual' as const,
        externalRef: 'search-cap-test',
        weBelegNo: `WE-CAP-${String(i + 1).padStart(4, '0')}`,
        bookingDate: asDay('2026-06-21'),
        branchNo: '1',
        section: 7,
        totalQuantity: 10,
        effortPoints: 5,
        estimatedMinutes: 15,
        storageLocationId: capLocation.id,
        status: 'ready' as const,
      })),
    });

    const overLimit = await read.searchCases({ limit: 9999 });
    expect(overLimit.length).toBe(50);
  });

  it('with no q, returns bookingDate-ordered browse results', async () => {
    const results = await read.searchCases({ bereich: 'Regal', limit: 50 });
    const weBelegNos = results.map((r) => r.weBelegNo);
    expect(weBelegNos.indexOf('WE-SEARCH-DATE-OLD')).toBeLessThan(weBelegNos.indexOf('WE-SEARCH-DATE-MID'));
    expect(weBelegNos.indexOf('WE-SEARCH-DATE-MID')).toBeLessThan(weBelegNos.indexOf('WE-SEARCH-DATE-NEW'));
  });
});
