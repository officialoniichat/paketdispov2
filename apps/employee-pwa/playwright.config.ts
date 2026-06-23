import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the Mitarbeiter-App (employee-pwa).
 *
 * Pilot-acceptance harness (§17.1 / Anhang G.5). Runs the built app via
 * `pnpm preview` on port 5175 against the seeded mock data (IndexedDB) so the
 * happy path works without any backend. Chromium-only and headless to stay lean.
 */
// 5185 (not the dev 5175): keeps the E2E preview isolated from any running dev
// server so the suite always tests this app's fresh build.
const PORT = 5185;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Force offline-demo mode (ignore any local .env backend URL) so the suite
    // tests the seeded happy path without a backend, as documented above.
    command: `VITE_API_BASE_URL= VITE_DEV_TOKEN= pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
