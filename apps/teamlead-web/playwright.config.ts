import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the Teamlead-Dashboard (teamlead-web).
 *
 * Pilot-acceptance harness (§17.1 / §8.4). Runs the built app via `pnpm preview`
 * on port 5174 against the seeded in-memory cockpit store so the cockpit and the
 * override audit gate work without any backend. Chromium-only and headless.
 */
// 5184 (not the dev 5174): isolates the E2E preview from any running dev server.
const PORT = 5184;

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
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
