/**
 * Cross-app navigation target: the Teamlead cockpit (web).
 *
 * Resolved via VITE_TEAMLEAD_APP_URL — at runtime from window.__ENV__ (/env.js),
 * else the build-time value, else the local Vite dev port (apps/teamlead-web runs
 * `vite --port 5174`). In production set the env var to the deployed teamlead-web
 * URL on Railway so the "Zur Teamlead-App" button opens it (not localhost:5174).
 */
import { resolveEnv } from './runtimeEnv.js';

export const TEAMLEAD_APP_URL: string =
  resolveEnv('VITE_TEAMLEAD_APP_URL') ?? 'http://localhost:5174';
