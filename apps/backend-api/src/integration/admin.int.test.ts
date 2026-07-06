import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, ValidationPipe } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_RULE_CONFIG } from '@paket/domain-types';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminService } from '../admin/admin.service.js';
import { RuleConfigDto } from '../admin/admin.dto.js';

/**
 * §11 Admin endpoints (locations master + structured rule config).
 *  - GET locations returns seeded rows.
 *  - PUT locations reconciles: adds a new code, updates an existing one, and
 *    soft-deactivates an unreferenced one that is omitted from the payload — but a
 *    referenced location omitted from the payload is rejected with a 409 (FK guard).
 *  - GET rules returns the seeded default; PUT rules round-trips and rejects an
 *    invalid config via the Zod boundary.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';

function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let admin: AdminService;

/** Seed two locations; R7 is referenced by a case (the FK-guard target), R18 is free. */
async function seed(): Promise<void> {
  const referenced = await prisma.location.create({
    data: { code: 'R7', displayName: 'Regal 7', kind: 'regal', zone: 'Zone A', sequenceIndex: 7 },
  });
  await prisma.location.create({
    data: { code: 'R18', displayName: 'Regal 18', kind: 'regal', zone: 'Zone A', sequenceIndex: 18 },
  });

  await prisma.goodsReceiptCase.create({
    data: {
      source: 'manual',
      externalRef: 'adm-set-1',
      weBelegNo: 'WE-ADM-1',
      bookingDate: asDate(DATE),
      branchNo: '1',
      storageLocationId: referenced.id,
      status: 'ready',
    },
  });
}

async function resetAndSeed(): Promise<void> {
  await prisma.goodsReceiptCase.deleteMany();
  await prisma.location.deleteMany();
  await seed();
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
  admin = new AdminService(prisma as unknown as PrismaService);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('admin locations (§11.2)', () => {
  beforeEach(resetAndSeed);

  it('lists seeded locations', async () => {
    const list = await admin.listLocations();
    expect(list.map((l) => l.code).sort()).toEqual(['R18', 'R7']);
    const r7 = list.find((l) => l.code === 'R7');
    expect(r7?.kind).toBe('regal');
    expect(r7?.sequenceIndex).toBe(7);
    expect(r7?.active).toBe(true);
  });

  it('reconciles add + update + soft-deactivate of an unreferenced location', async () => {
    const result = await admin.replaceLocations([
      // Keep + update R7 (referenced)
      { code: 'R7', displayName: 'Regal 7 neu', kind: 'regal', zone: 'Zone A', sequenceIndex: 7, active: true },
      // Add R99 (R18 omitted → soft-deactivate)
      { code: 'R99', displayName: 'Regal 99', kind: 'regal', active: true },
    ]);
    const byCode = new Map(result.map((l) => [l.code, l]));
    expect(byCode.get('R99')?.displayName).toBe('Regal 99');
    expect(byCode.get('R7')?.displayName).toBe('Regal 7 neu');
    expect(byCode.get('R7')?.active).toBe(true);
    // The omitted free location is soft-deactivated, not hard-deleted (still present).
    expect(byCode.get('R18')?.active).toBe(false);
  });

  it('rejects removing a location referenced by a case (409)', async () => {
    // Payload omits the referenced R7 entirely → would orphan a case → 409.
    await expect(
      admin.replaceLocations([
        { code: 'R18', displayName: 'Regal 18', kind: 'regal', active: true },
      ]),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('admin rule config (§11)', () => {
  it('returns the seeded default config', async () => {
    await admin.seedDefaultRuleConfig();
    const rules = await admin.getRuleConfig();
    expect(rules.priority.dailyShopAreas).toEqual(DEFAULT_RULE_CONFIG.priority.dailyShopAreas);
    expect(rules.bundle.starterPackMinTeile).toBe(DEFAULT_RULE_CONFIG.bundle.starterPackMinTeile);
  });

  it('round-trips a PUT of a changed config', async () => {
    const next = {
      ...DEFAULT_RULE_CONFIG,
      bundle: { ...DEFAULT_RULE_CONFIG.bundle, starterPackMaxTeile: 300 },
    };
    const saved = await admin.replaceRuleConfig(next);
    expect(saved.bundle.starterPackMaxTeile).toBe(300);
    const reread = await admin.getRuleConfig();
    expect(reread.bundle.starterPackMaxTeile).toBe(300);
  });

  it('round-trips all 8 grouping fields through the DTO whitelist (D3 gap)', async () => {
    // Non-default values for EVERY groupingRuleConfigSchema field: if the DTO were
    // still partial, the global `whitelist: true` ValidationPipe would strip the
    // undeclared fields before the service ever sees them.
    const grouping = {
      enabled: true,
      useSourceKey: false,
      useDeliveryNote: false,
      useBelegRun: true,
      maxWeBelegGap: 3,
      runRequiresSameDay: false,
      runRequiresSameSection: false,
      autoDistributeSuspected: true,
    };
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const body = (await pipe.transform(
      { ...DEFAULT_RULE_CONFIG, grouping },
      { type: 'body', metatype: RuleConfigDto },
    )) as RuleConfigDto;
    expect(body.grouping).toEqual(grouping);
    // Free-form number maps must survive the whitelist too (@Allow on the DTO).
    expect(body.effort.wgrFactors).toEqual(DEFAULT_RULE_CONFIG.effort.wgrFactors);
    expect(body.effort.handlingClassFactors).toEqual(
      DEFAULT_RULE_CONFIG.effort.handlingClassFactors,
    );

    const saved = await admin.replaceRuleConfig(body as never);
    expect(saved.grouping).toEqual(grouping);
    const reread = await admin.getRuleConfig();
    expect(reread.grouping).toEqual(grouping);
  });

  it('rejects an invalid config (Zod boundary)', async () => {
    const bad = {
      ...DEFAULT_RULE_CONFIG,
      priority: { ...DEFAULT_RULE_CONFIG.priority, dailyShopAreas: -5 },
    };
    await expect(admin.replaceRuleConfig(bad as never)).rejects.toThrow();
  });
});
