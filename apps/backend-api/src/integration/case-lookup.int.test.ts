import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TeamleadReadService } from '../cases/teamlead-read.service.js';

/**
 * B1 WE-Nr-Zuweisung against a REAL Postgres (Testcontainers): the lookup endpoint
 * behind the board's Zuweisen dialog. One verdict per seed constellation:
 *   - ready + unassigned  → found, assignable, Bereich/Teile projected
 *   - unknown WE-Nr       → not_found
 *   - assigned to someone → already_assigned (with the holder's name)
 *   - parked              → wrong_status
 *   - blocked (Intake-Gate) → blocked
 * The test drives TeamleadReadService.lookupCase directly (no HTTP) for determinism.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';

function asDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let read: TeamleadReadService;

async function seed(): Promise<void> {
  const heinz = await prisma.user.create({
    data: { employeeNo: 'ma-301', displayName: 'Heinz', bereiche: ['Regal'] },
  });
  const loc = await prisma.location.create({
    data: { code: 'R31', displayName: 'Regal 31', kind: 'regal', sequenceIndex: 31 },
  });
  const day = asDay(DATE);

  const base = {
    source: 'manual' as const,
    externalRef: 'lookup-set-1',
    bookingDate: day,
    branchNo: '1',
    section: 7,
    totalQuantity: 42,
    effortPoints: 8,
    estimatedMinutes: 20,
  };

  // Free ready Beleg — the happy path.
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-L-READY', storageLocationId: loc.id, status: 'ready' },
  });

  // Parked Beleg — wrong_status.
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-L-PARKED', storageLocationId: loc.id, status: 'parked' },
  });

  // Blocked Beleg (Intake-Gate D1, Lagerplatz fehlt) — blocked.
  await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      weBelegNo: 'WE-L-BLOCKED',
      status: 'blocked',
      missingFields: ['storageLocation'],
    },
  });

  // Beleg already held by Heinz — already_assigned.
  const held = await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-L-HELD', storageLocationId: loc.id, status: 'assigned' },
  });
  const bundle = await prisma.assignmentBundle.create({
    data: {
      employeeId: heinz.id,
      date: day,
      status: 'assigned',
      createdBy: 'system',
      plannedEffortMinutes: 20,
    },
  });
  await prisma.assignmentItem.create({
    data: { bundleId: bundle.id, caseId: held.id, sequence: 0 },
  });
  await prisma.goodsReceiptCase.update({
    where: { id: held.id },
    data: { assignedBundleId: bundle.id },
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
  read = new TeamleadReadService(prisma as unknown as PrismaService);
  await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('B1 lookupCase — verdicts', () => {
  it('finds a free ready Beleg and marks it assignable (Bereich + Teile projected)', async () => {
    const result = await read.lookupCase('WE-L-READY');
    expect(result.found).toBe(true);
    expect(result.assignable).toBe(true);
    expect(result.reasonCode).toBeNull();
    expect(result.weBelegNo).toBe('WE-L-READY');
    expect(result.status).toBe('ready');
    expect(result.bereich).toBe('Regal');
    expect(result.teile).toBe(42);
    expect(result.assignedEmployeeName).toBeNull();
    expect(result.caseId).toBeTruthy();
  });

  it('is case-insensitive and trims the input', async () => {
    const result = await read.lookupCase('  we-l-ready ');
    expect(result.found).toBe(true);
    expect(result.weBelegNo).toBe('WE-L-READY');
  });

  it("returns not_found for an unknown WE-Nr", async () => {
    const result = await read.lookupCase('WE-DOES-NOT-EXIST');
    expect(result.found).toBe(false);
    expect(result.assignable).toBe(false);
    expect(result.reasonCode).toBe('not_found');
    expect(result.caseId).toBeNull();
  });

  it("returns not_found for a blank input (no accidental findFirst catch-all)", async () => {
    const result = await read.lookupCase('   ');
    expect(result.found).toBe(false);
    expect(result.reasonCode).toBe('not_found');
  });

  it("returns already_assigned with the holder's name for a held Beleg", async () => {
    const result = await read.lookupCase('WE-L-HELD');
    expect(result.found).toBe(true);
    expect(result.assignable).toBe(false);
    expect(result.reasonCode).toBe('already_assigned');
    expect(result.assignedEmployeeName).toBe('Heinz');
    expect(result.status).toBe('assigned');
  });

  it('returns wrong_status for a parked Beleg', async () => {
    const result = await read.lookupCase('WE-L-PARKED');
    expect(result.found).toBe(true);
    expect(result.assignable).toBe(false);
    expect(result.reasonCode).toBe('wrong_status');
    expect(result.status).toBe('parked');
  });

  it('returns blocked for an Intake-Gate blocked Beleg (Lagerplatz fehlt)', async () => {
    const result = await read.lookupCase('WE-L-BLOCKED');
    expect(result.found).toBe(true);
    expect(result.assignable).toBe(false);
    expect(result.reasonCode).toBe('blocked');
    expect(result.bereich).toBeNull();
  });
});
