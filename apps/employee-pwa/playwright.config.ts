import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, BACKEND_PORT } from './e2e/fixtures/ports.js';

/**
 * Playwright E2E config for the Mitarbeiter-App (employee-pwa).
 *
 * Pilot-acceptance harness (§17.1 / Anhang G.5). Runs the built app via
 * `pnpm preview` against a REAL backend-api instance + a REAL, seeded
 * Postgres (Testcontainers) — see `e2e/fixtures/global-setup.ts`. The former
 * offline/Dexie-demo-scenario harness is gone: the app no longer has Dexie,
 * demo scenarios, or Tisch-Anmeldung (a real login against `/api/auth/login`
 * plus `/api/me/today` replaced them), so there is no offline path left to
 * test against.
 */
// 5185 (not the dev 5175): keeps the E2E preview isolated from any running dev
// server so the suite always tests this app's fresh build.
const PORT = APP_PORT;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Testcontainers (cold Docker pull) + a 3-package workspace build can
  // together take well over a minute on a cold cache; globalSetup is NOT
  // itself bounded by `webServer.timeout`, so give the whole run generous
  // headroom instead.
  globalTimeout: 15 * 60_000,
  globalSetup: './e2e/fixtures/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build against the REAL backend booted by globalSetup (fixed port, see
    // e2e/fixtures/ports.ts) instead of forcing offline mode.
    command: `VITE_API_BASE_URL=http://localhost:${BACKEND_PORT} pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
