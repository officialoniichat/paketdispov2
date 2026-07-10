/**
 * Playwright global setup: boots a real Postgres (Testcontainers) + a real
 * backend-api instance, loads the real scenario seed, and commits one day
 * assignment so the cockpit has a populated Mitarbeiterboard.
 *
 * Returning a teardown closure keeps setup and teardown in the SAME process,
 * which avoids smuggling the Testcontainers handle and the backend child
 * process across the boundary a separate `globalTeardown` file would impose.
 *
 * Ordering note: Playwright starts `webServer` BEFORE `globalSetup`, so the
 * cockpit build has already run by the time the backend comes up. That is
 * fine — the build bakes in nothing but the localhost fallback, and each test
 * injects the real backend URL + a freshly minted bearer token at runtime by
 * stubbing `/env.js` (see ./test.ts).
 */
import { startBackend } from './backend-server.js';
import { recalculateAssignments, seedScenario } from './seed.js';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const backend = await startBackend();
  seedScenario(backend.databaseUrl);
  await recalculateAssignments();

  return async () => {
    await backend.stop();
  };
}
