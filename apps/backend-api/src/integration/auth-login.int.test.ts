import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { hashPin } from '../auth/pin.js';

/**
 * POST /api/auth/login (Task 4 of the PIN-login SDD plan) against a REAL Postgres
 * (Testcontainers) AND a real, fully-bootstrapped Nest/Fastify app — this is the one
 * integration test in this directory that boots the actual HTTP layer (via Fastify's
 * `inject()`, no extra `supertest` dependency needed) so it can prove the issued token
 * round-trips through the real `JwtAuthGuard`/`RolesGuard`, not just the pure service.
 *
 * A dev RS256 keypair is generated per-run and injected via AUTH_DEV_PUBLIC_KEY /
 * AUTH_DEV_PRIVATE_KEY *before* anything imports `config.ts` (a module-level, frozen
 * singleton) — hence the dynamic imports of the Nest/App modules below.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let app: NestFastifyApplication;

async function seed(): Promise<void> {
  const role = await prisma.role.create({ data: { name: 'employee' } });
  const user = await prisma.user.create({
    data: {
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      active: true,
      pinHash: await hashPin('4711'),
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
}

function post(url: string, payload: unknown) {
  return app.getHttpAdapter().getInstance().inject({ method: 'POST', url, payload });
}

function get(url: string, headers: Record<string, string> = {}) {
  return app.getHttpAdapter().getInstance().inject({ method: 'GET', url, headers });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  process.env.DATABASE_URL = url;
  process.env.AUTH_DEV_PUBLIC_KEY = publicKey;
  process.env.AUTH_DEV_PRIVATE_KEY = privateKey;
  process.env.SWAGGER_ENABLED = 'false';

  prisma = new PrismaClient({ datasourceUrl: url });
  await seed();

  const [{ NestFactory }, { FastifyAdapter }, { ValidationPipe }, { AppModule }] = await Promise.all([
    import('@nestjs/core'),
    import('@nestjs/platform-fastify'),
    import('@nestjs/common'),
    import('../app.module.js'),
  ]);

  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await container?.stop();
});

describe('POST /api/auth/login', () => {
  it('returns 200 + a token for correct credentials', async () => {
    const res = await post('/api/auth/login', { employeeNo: 'ma-101', pin: '4711' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { token: string };
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  it('returns 401 for a wrong PIN', async () => {
    const res = await post('/api/auth/login', { employeeNo: 'ma-101', pin: '0000' });

    expect(res.statusCode).toBe(401);
  });

  it('returns an IDENTICAL 401 body for an unknown employeeNo and a wrong PIN (no user enumeration)', async () => {
    const unknownUser = await post('/api/auth/login', { employeeNo: 'ma-does-not-exist', pin: '4711' });
    const wrongPin = await post('/api/auth/login', { employeeNo: 'ma-101', pin: '0000' });

    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPin.statusCode).toBe(401);
    expect(unknownUser.json()).toEqual(wrongPin.json());
  });

  it('the returned token authorizes a call to GET /api/me/today', async () => {
    const login = await post('/api/auth/login', { employeeNo: 'ma-101', pin: '4711' });
    const { token } = login.json() as { token: string };

    const res = await get('/api/me/today', { authorization: `Bearer ${token}` });

    expect(res.statusCode).toBe(200);
  });
});
