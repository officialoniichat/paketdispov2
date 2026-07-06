/**
 * Fixed ports for the e2e harness.
 *
 * BACKEND_PORT is a hard-coded, out-of-band port (not 3000, the dev backend's
 * own port; not 5175/5185, the employee-pwa dev/preview ports) so a real dev
 * server running alongside this suite never collides with the ephemeral
 * backend this harness boots against a Testcontainers Postgres.
 *
 * The port is fixed (rather than dynamically chosen and threaded through)
 * because Playwright's `webServer.command` (which bakes `VITE_API_BASE_URL`
 * into the built bundle) and `globalSetup` (which boots the backend) are
 * configured independently in `playwright.config.ts` — a fixed constant
 * avoids having to pass a dynamically-chosen port across that boundary.
 */
export const BACKEND_PORT = 3099;
export const APP_PORT = 5185;
