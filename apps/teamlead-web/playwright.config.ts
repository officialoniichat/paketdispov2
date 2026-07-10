import { defineConfig, devices } from '@playwright/test';
import { APP_PORT } from './e2e/fixtures/ports.js';

/**
 * Playwright E2E config for the Teamlead-Dashboard (teamlead-web).
 *
 * Vorab-Abnahme-Harness: runs the built app via `vite preview` against a REAL
 * backend-api instance on a REAL, seeded Postgres (Testcontainers) — see
 * `e2e/fixtures/global-setup.ts`. The cockpit's data layer (`src/data/store.tsx`,
 * `belege.ts`, `admin.ts`) reads the live `/api/teamlead/*` and `/api/admin/*`
 * endpoints; there is no in-memory cockpit dataset left to test against.
 *
 * Each test injects the backend URL + a freshly minted bearer token by stubbing
 * `/env.js` (see `e2e/fixtures/test.ts`), so nothing is baked into the build.
 */
// 5184 (not the dev 5174): isolates the E2E preview from any running dev server.
const PORT = APP_PORT;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Testcontainers (cold Docker pull), a workspace build and the scenario seed
  // can together exceed a minute on a cold cache; `globalSetup` is NOT bounded
  // by `webServer.timeout`, so give the whole run generous headroom.
  globalTimeout: 15 * 60_000,
  globalSetup: './e2e/fixtures/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    headless: true,
    // Der Kunde arbeitet auf deutschen Rechnern. Die App formatiert selbst in
    // de-DE (src/lib/format.ts), aber native Controls — vor allem
    // `<input type="date">` im Verladeplan — folgen der Browser-Locale.
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
