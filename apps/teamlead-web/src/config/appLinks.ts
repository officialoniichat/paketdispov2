/**
 * Cross-app navigation target: the Mitarbeiter-App (employee PWA).
 *
 * Resolved via VITE_EMPLOYEE_APP_URL — at runtime from window.__ENV__ (/env.js),
 * else the build-time value, else the local Vite dev port (apps/employee-pwa runs
 * `vite --port 5175`). In production set the env var to the deployed employee-pwa
 * URL on Railway so the "Zur Mitarbeiter-App" button opens it (not localhost:5175).
 */
import { resolveEnv } from './runtimeEnv.js';

export const EMPLOYEE_APP_URL: string =
  resolveEnv('VITE_EMPLOYEE_APP_URL') ?? 'http://localhost:5175';
