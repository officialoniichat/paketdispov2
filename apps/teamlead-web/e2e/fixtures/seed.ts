/**
 * Seeds the ephemeral Postgres with the REAL scenario seed and commits one
 * day-assignment, so the cockpit boots against the same data a developer sees
 * after `pnpm --filter @paket/backend-api exec prisma db seed`.
 *
 * Deliberately NOT a hand-rolled fixture (unlike the employee-pwa harness,
 * which needs two isolated employees): the teamlead cockpit renders the whole
 * day — KPIs, Mitarbeiterboard, the assignable pool, Regelkonfiguration,
 * Verladeplan, Lagerplätze — and every one of those comes from the scenario
 * seed. Reproducing it here would duplicate `src/dev/scenarios/` and drift.
 *
 * `prisma db seed` refuses to run with NODE_ENV=production unless
 * SEED_ON_DEPLOY=1; the backend child process is started with NODE_ENV=test
 * (see ./backend-server.ts) and this step inherits that.
 */
import { execSync } from 'node:child_process';
import { BACKEND_DIR } from './backend-server.js';
import { BACKEND_URL } from './ports.js';
import { bearer, DEMO_PIN, login, TEAMLEAD_NO } from './auth.js';

/** Load the `standard` scenario: users+roles+PINs, Lagerplätze, Regeln, Verladeplan, Belege. */
export function seedScenario(databaseUrl: string): void {
  execSync('pnpm exec prisma db seed', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' },
    stdio: 'inherit',
  });
}

/**
 * Commit one day-assignment (§8.3 „Neu berechnen"). Without it the seeded
 * Belege stay in the pool and no employee has a Bündel — the Mitarbeiterboard
 * would be empty and „Rest parken" would have nothing to park.
 */
export async function recalculateAssignments(): Promise<void> {
  const token = await login(TEAMLEAD_NO, DEMO_PIN);
  const res = await fetch(`${BACKEND_URL}/api/teamlead/assignments/recalculate`, {
    method: 'POST',
    headers: bearer(token),
    // No `date`: the backend defaults to today, which is what the cockpit shows.
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`recalculate failed: HTTP ${res.status} ${await res.text()}`);
  }
}
