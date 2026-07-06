/**
 * Boots a REAL backend-api instance (Testcontainers Postgres + the actual
 * NestJS/Fastify HTTP server) for the employee-pwa e2e suite.
 *
 * Bootstrap mechanism: CHILD PROCESS running the `tsc`-built `dist/main.js`,
 * not an in-process `NestFactory.create(...)` call (the pattern used by
 * `apps/backend-api/src/integration/*.int.test.ts`). This is a deliberate
 * deviation from that pattern:
 *
 * `apps/backend-api/vitest.integration.config.ts` documents that booting the
 * real Nest app needs `unplugin-swc`'s decorator-metadata transform —
 * Vitest's/Playwright's default esbuild-based TS transform strips
 * `design:paramtypes`, which silently breaks Nest's implicit
 * constructor-injection for EVERY provider in the graph. Playwright's
 * `globalSetup`/config TS loader has the same esbuild-based transform as
 * Vitest's default pool, so importing `NestFactory`/`AppModule` straight into
 * a Playwright-loaded `.ts` file would hit the exact same silent-DI-breakage
 * class of bug. `backend-api`'s own production build (`tsc`, with
 * `emitDecoratorMetadata: true` in its tsconfig) does not have this problem —
 * that's exactly how the app runs in production — so spawning the compiled
 * `dist/main.js` as a child process sidesteps the issue entirely and is, if
 * anything, MORE faithful to production than an in-process boot would be.
 *
 * Seeding (`./seed.ts`) uses `@prisma/client` directly, which has no
 * decorator/reflection dependency at all, so it stays safe running inside
 * Playwright's own TS transform.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { BACKEND_PORT } from './ports.js';

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(FIXTURES_DIR, '..', '..', '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'apps', 'backend-api');

export interface RunningBackend {
  databaseUrl: string;
  baseUrl: string;
  stop: () => Promise<void>;
}

async function waitForReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/readyz`);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Backend did not become ready at ${baseUrl}/readyz within ${timeoutMs}ms: ${String(lastError)}`,
  );
}

/**
 * Starts Postgres (Testcontainers), runs migrations, builds + boots the real
 * backend against it. Does NOT seed — call `seedDatabase(databaseUrl)`
 * (from `./seed.ts`) separately once this resolves.
 */
export async function startBackend(): Promise<RunningBackend> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  ).start();
  const databaseUrl = container.getConnectionUri();

  execSync('pnpm exec prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  // Build once per run: produces dist/main.js with real decorator metadata
  // (tsc, emitDecoratorMetadata: true) AND regenerates @prisma/client to
  // match the CURRENT schema.prisma (see prisma-client.ts for why the
  // generated client is reached into directly rather than reinstalled).
  execSync('pnpm --filter @paket/backend-api build', {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const baseUrl = `http://localhost:${BACKEND_PORT}`;
  const child: ChildProcess = spawn(
    process.execPath,
    [path.join(BACKEND_DIR, 'dist', 'main.js')],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        AUTH_DEV_PUBLIC_KEY: publicKey,
        AUTH_DEV_PRIVATE_KEY: privateKey,
        API_HOST: '0.0.0.0',
        PORT: String(BACKEND_PORT),
        SWAGGER_ENABLED: 'false',
        OTEL_SDK_DISABLED: 'true',
        NODE_ENV: 'test',
        // The built preview app runs on APP_PORT (see playwright.config.ts) —
        // it needs explicit cross-origin permission from the backend.
        CORS_ORIGINS: 'http://localhost:5185',
      },
      stdio: 'inherit',
    },
  );

  let exited = false;
  child.once('exit', (code, signal) => {
    exited = true;
    if (code !== 0 && signal === null) {
      // eslint-disable-next-line no-console
      console.error(`[e2e backend] dist/main.js exited early with code ${code}`);
    }
  });

  try {
    await waitForReady(baseUrl, 60_000);
  } catch (err) {
    if (exited) {
      throw new Error('Backend process exited before becoming ready — see logs above.');
    }
    throw err;
  }

  const stop = async (): Promise<void> => {
    if (!exited) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        setTimeout(resolve, 5_000);
      });
    }
    await container.stop();
  };

  return { databaseUrl, baseUrl, stop };
}
