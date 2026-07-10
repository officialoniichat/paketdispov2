/**
 * Fixed ports for the teamlead-web e2e harness.
 *
 * Both are out-of-band, distinct from every dev port (backend 3000, teamlead
 * 5174, employee-pwa 5175) AND from the employee-pwa e2e harness (3099/5185),
 * so this suite can run next to a dev stack — and next to that suite — without
 * either stealing the other's ports.
 *
 * The backend port is a constant rather than a dynamically chosen free port
 * because `playwright.config.ts`'s `webServer.command` and `globalSetup` are
 * configured independently: Playwright starts the webServer BEFORE globalSetup,
 * so there is no moment at which a dynamically chosen port could be threaded
 * from the backend into the built bundle.
 */
export const BACKEND_PORT = 3098;
export const APP_PORT = 5184;

/** Base URL of the e2e backend — the cockpit's `VITE_API_BASE_URL`. */
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

/** Origin of the built cockpit served by `vite preview`; the backend's CORS allowlist. */
export const APP_URL = `http://localhost:${APP_PORT}`;
