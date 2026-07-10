/**
 * Shared Playwright fixture for the teamlead-web e2e suite.
 *
 * Wires the built cockpit to the backend booted in `global-setup.ts`. The
 * cockpit resolves its backend URL and bearer token from `window.__ENV__`,
 * which `index.html` loads from `/env.js` BEFORE the app bundle — in
 * production that file is generated at container start by
 * `scripts/write-runtime-env.mjs`; in the repo it is an empty placeholder
 * (`public/env.js`, `window.__ENV__ = {}`).
 *
 * Fulfilling the `/env.js` request is therefore the one injection point that
 * matches production exactly. It also has to be a route stub rather than an
 * `addInitScript`: the placeholder would otherwise run afterwards and reset
 * `window.__ENV__` to `{}`.
 *
 * The token is minted per worker through the real `POST /api/auth/login`, so
 * the suite never needs the backend's ephemeral signing key.
 */
import { test as base, expect } from '@playwright/test';
import { DEMO_PIN, login, TEAMLEAD_NO } from './auth.js';
import { BACKEND_URL } from './ports.js';

interface CockpitWorkerFixtures {
  /** Bearer token for `tl-001`, minted once per worker against the live backend. */
  teamleadToken: string;
}

export const test = base.extend<Record<string, never>, CockpitWorkerFixtures>({
  teamleadToken: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(await login(TEAMLEAD_NO, DEMO_PIN));
    },
    { scope: 'worker' },
  ],

  page: async ({ page, teamleadToken }, use) => {
    const runtimeEnv = { VITE_API_BASE_URL: BACKEND_URL, VITE_DEV_TOKEN: teamleadToken };
    await page.route('**/env.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.__ENV__ = ${JSON.stringify(runtimeEnv)};\n`,
      }),
    );
    await use(page);
  },
});

export { expect };
export type { Page } from '@playwright/test';
