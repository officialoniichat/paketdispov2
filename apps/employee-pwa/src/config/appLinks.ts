/**
 * Cross-app navigation target: the Teamlead cockpit (web).
 *
 * Configurable via VITE_TEAMLEAD_APP_URL; falls back to the local Vite dev port
 * (apps/teamlead-web runs `vite --port 5174`). In production set the env var to
 * the deployed cockpit URL.
 */
export const TEAMLEAD_APP_URL: string =
  import.meta.env.VITE_TEAMLEAD_APP_URL ?? 'http://localhost:5174';
