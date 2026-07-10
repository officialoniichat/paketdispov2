/**
 * Boots a REAL backend-api instance (Testcontainers Postgres + the actual
 * NestJS/Fastify HTTP server) for the teamlead-web e2e suite.
 *
 * Bootstrap mechanism: CHILD PROCESS running the `tsc`-built `dist/main.js`,
 * not an in-process `NestFactory.create(...)` call. Booting Nest in-process
 * needs `emitDecoratorMetadata` (`design:paramtypes`); Playwright's TS loader
 * is esbuild-based and strips it, which silently breaks Nest's constructor
 * injection for every provider in the graph. The backend's own production
 * build (`tsc`) emits that metadata, so spawning the compiled `dist/main.js`
 * sidesteps the issue and is, if anything, more faithful to production.
 * Same rationale and shape as `apps/employee-pwa/e2e/fixtures/backend-server.ts`.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { APP_URL, BACKEND_PORT, BACKEND_URL } from './ports.js';

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
 * backend against it. Does NOT seed — call `seedScenario(databaseUrl)` (from
 * `./seed.ts`) once this resolves.
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
  // (tsc, emitDecoratorMetadata: true) AND regenerates @prisma/client against
  // the current schema.prisma.
  execSync('pnpm --filter @paket/backend-api build', {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  // Ephemeral signing key: the cockpit's bearer token is minted by this very
  // backend via POST /api/auth/login (see ./auth.ts), so nothing outside this
  // process ever needs the key — no fixture key has to be committed.
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const child: ChildProcess = spawn(process.execPath, [path.join(BACKEND_DIR, 'dist', 'main.js')], {
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
      // NOT 'production': prisma/seed.ts refuses to wipe a production database
      // without SEED_ON_DEPLOY=1.
      NODE_ENV: 'test',
      // The built preview app is a different origin and needs explicit CORS.
      CORS_ORIGINS: APP_URL,
    },
    stdio: 'inherit',
  });

  let exited = false;
  child.once('exit', (code, signal) => {
    exited = true;
    if (code !== 0 && signal === null) {
      // eslint-disable-next-line no-console
      console.error(`[e2e backend] dist/main.js exited early with code ${code}`);
    }
  });

  try {
    await waitForReady(BACKEND_URL, 60_000);
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

  return { databaseUrl, baseUrl: BACKEND_URL, stop };
}

/** Repo path the seed step needs (`prisma db seed` runs from the backend package). */
export { BACKEND_DIR };
