#!/usr/bin/env node
/**
 * Generates dist/env.js from the container's runtime environment so the deployed
 * SPA can resolve its backend/cross-app URLs WITHOUT a rebuild.
 *
 * Why: Vite bakes import.meta.env.VITE_* at BUILD time. On Railway that is fragile
 * (a build that ran before the variables were set bakes in the localhost fallback,
 * and changing a URL needs a fresh rebuild). This script runs as the FIRST step of
 * the production start command — before `vite preview` serves dist/ — and writes the
 * runtime values to dist/env.js. The browser loads it as /env.js and reads
 * window.__ENV__ (see src/config/runtimeEnv.ts), runtime winning over build-time.
 *
 * /env.js is excluded from the Workbox precache (vite.config.ts globIgnores) so the
 * service worker never serves a stale copy. Only a fixed allowlist of VITE_* keys is
 * emitted, and only when non-empty, so an unset variable cleanly falls back to the
 * build-time/localhost default. /env.js is public — never add non-VITE secrets here.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Public client config keys safe to expose via /env.js (same contract as VITE_*). */
const PUBLIC_KEYS = [
  'VITE_API_BASE_URL',
  'VITE_EMPLOYEE_APP_URL',
  'VITE_TEAMLEAD_APP_URL',
  'VITE_DEV_TOKEN',
  // Demo-only: prefills the Mitarbeiternummer on the login screen (see
  // src/screens/LoginScreen.tsx). Leave unset on any environment a customer uses
  // productively — the field then starts empty.
  'VITE_DEMO_EMPLOYEE_NO',
];

const env = {};
for (const key of PUBLIC_KEYS) {
  const value = process.env[key];
  if (value != null && value.trim() !== '') env[key] = value.trim();
}

// dist/ sits next to this script's parent (apps/<app>/dist); resolve from the
// script file so the result is independent of the process working directory.
const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
mkdirSync(distDir, { recursive: true });
const target = resolve(distDir, 'env.js');
writeFileSync(target, `window.__ENV__ = ${JSON.stringify(env, null, 2)};\n`, 'utf8');

const keys = Object.keys(env);
console.log(
  `[write-runtime-env] ${target} <- ${keys.length ? keys.join(', ') : '(no VITE_* runtime vars set; using build-time/localhost fallback)'}`,
);
