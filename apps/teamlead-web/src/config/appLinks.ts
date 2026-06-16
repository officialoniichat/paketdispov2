/**
 * Cross-app navigation target: the Mitarbeiter-App (employee PWA).
 *
 * Configurable via VITE_EMPLOYEE_APP_URL; falls back to the local Vite dev port
 * (apps/employee-pwa runs `vite --port 5175`). In production set the env var to
 * the deployed URL — behind Caddy the employee PWA is served at the site root.
 */
export const EMPLOYEE_APP_URL: string =
  import.meta.env.VITE_EMPLOYEE_APP_URL ?? 'http://localhost:5175';
