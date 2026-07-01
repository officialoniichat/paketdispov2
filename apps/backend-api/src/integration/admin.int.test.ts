import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_EFFORT_RULE_CONFIG, DEFAULT_RULE_CONFIG, type RuleConfig } from '@paket/domain-types';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminService } from '../admin/admin.service.js';
import { AdminModule } from '../admin/admin.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

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
let app: NestFastifyApplication;

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

  // Boot the REAL HTTP stack so the rule-config PUT runs through the global
  // ValidationPipe from src/main.ts — the layer that (with `whitelist: true`)
  // strips undecorated body fields and thus reproduces the production 400. Only
  // PrismaModule + AdminModule are imported: AuthModule (which registers the
  // global JwtAuthGuard/RolesGuard as APP_GUARDs) is left out, so the route is
  // reachable without a token. The app's PrismaService connects via DATABASE_URL,
  // so point it at the same container the direct `prisma` client uses.
  process.env.DATABASE_URL = url;
  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, AdminModule],
  }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
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
    expect(rules.priority.overdueLeadDays).toBe(DEFAULT_RULE_CONFIG.priority.overdueLeadDays);
    expect(rules.bundle.maxCases).toBe(DEFAULT_RULE_CONFIG.bundle.maxCases);
  });

  it('round-trips a PUT of a changed config', async () => {
    const next = {
      ...DEFAULT_RULE_CONFIG,
      bundle: { ...DEFAULT_RULE_CONFIG.bundle, maxCases: 12 },
    };
    const saved = await admin.replaceRuleConfig(next);
    expect(saved.bundle.maxCases).toBe(12);
    const reread = await admin.getRuleConfig();
    expect(reread.bundle.maxCases).toBe(12);
  });

  it('rejects an invalid config (Zod boundary)', async () => {
    const bad = {
      ...DEFAULT_RULE_CONFIG,
      priority: { ...DEFAULT_RULE_CONFIG.priority, overdueLeadDays: -5 },
    };
    await expect(admin.replaceRuleConfig(bad as never)).rejects.toThrow();
  });

  /**
   * Regression for the production 400 on any RuleConfig tab. The global
   * ValidationPipe runs with `whitelist: true`, which STRIPS every body property
   * that lacks a class-validator decorator on the DTO — before AdminService
   * re-validates with the Zod schema (the trust boundary). The grouping.* booleans
   * and the effort factor maps (handlingClassFactors/wgrFactors) had drifted out of
   * the DTO, so a full PUT lost those 8 fields and Zod rejected the body with
   * "Ungültige Regelkonfiguration" (HTTP 400). This drives the real endpoint through
   * that pipe and asserts the 8 fields survive on both the PUT response and a
   * subsequent GET. It fails (400) before the DTO fix and passes after.
   */
  it('PUT /api/admin/rules keeps grouping.* + effort factor maps through the whitelist pipe', async () => {
    // A COMPLETE, valid config with the 8 previously-stripped fields set to
    // distinctive non-default values so any silent strip is detectable.
    const config: RuleConfig = {
      ...DEFAULT_RULE_CONFIG,
      grouping: {
        enabled: true,
        useSourceKey: false,
        useDeliveryNote: false,
        useBelegRun: true,
        maxWeBelegGap: 3,
        runRequiresSameDay: false,
        runRequiresSameSection: true,
        autoDistributeSuspected: true,
      },
      effort: {
        ...DEFAULT_EFFORT_RULE_CONFIG,
        handlingClassFactors: { normal: 1, bulky: 1.5, custom_class: 2.25 },
        wgrFactors: { '999999': 1.75, default: 1 },
      },
    };

    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/rules',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(config),
    });

    // Before the fix the whitelist pipe strips the 8 fields → Zod 400.
    expect(res.statusCode).toBe(200);
    const body = res.json() as RuleConfig;
    expect(body.grouping).toEqual(config.grouping);
    expect(body.effort.handlingClassFactors).toEqual(config.effort.handlingClassFactors);
    expect(body.effort.wgrFactors).toEqual(config.effort.wgrFactors);

    // …and they persist: a fresh GET round-trips the exact same 8 fields.
    const reread = await app.inject({ method: 'GET', url: '/api/admin/rules' });
    expect(reread.statusCode).toBe(200);
    const persisted = reread.json() as RuleConfig;
    expect(persisted.grouping).toEqual(config.grouping);
    expect(persisted.effort.handlingClassFactors).toEqual(config.effort.handlingClassFactors);
    expect(persisted.effort.wgrFactors).toEqual(config.effort.wgrFactors);
  });
});
