/**
 * Playwright global setup: boots a real Postgres (Testcontainers) + a real
 * backend-api instance, seeds two employees with isolated data (`seed-data.ts`
 * holds the constants both this file and `employee-flow.spec.ts` use), and
 * returns a teardown closure. Returning a function from `globalSetup` keeps
 * setup and teardown in the SAME process (supported since early Playwright
 * 1.x — see `@playwright/test` docs on "Global setup and teardown"), which
 * avoids having to smuggle the Testcontainers handle / child-process
 * reference across the process boundary that a separate `globalTeardown`
 * file would otherwise require.
 *
 * Timeouts: Testcontainers may need to pull `postgres:16-alpine` on a cold
 * Docker cache, and `pnpm --filter @paket/backend-api build` compiles 3
 * workspace packages — both can comfortably exceed Playwright's default
 * per-test timeout. `playwright.config.ts` sets `globalTimeout` generously
 * (see comment there) to cover a cold run.
 */
import { startBackend } from './backend-server.js';
import { seedDatabase } from './seed.js';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const backend = await startBackend();
  await seedDatabase(backend.databaseUrl);

  return async () => {
    await backend.stop();
  };
}
