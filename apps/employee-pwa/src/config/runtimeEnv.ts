/**
 * Runtime-first resolution of the deployment's VITE_* configuration.
 *
 * Vite bakes `import.meta.env.VITE_*` into the bundle at BUILD time. That is too
 * rigid for Railway: changing a URL would require a rebuild, and any build that ran
 * before the variables were set silently bakes in the localhost fallback (this is
 * the root cause of the localhost:3000 API calls and the localhost:5174 cross-app
 * button on the live deployment). To make the deployment robust we read runtime
 * values from `window.__ENV__` first — that object is produced at container start by
 * `scripts/write-runtime-env.mjs`, served as `/env.js`, and loaded before the app
 * bundle (see index.html). Resolution order:
 *
 *   1. window.__ENV__[key]     runtime value (prod; changeable without a rebuild)
 *   2. import.meta.env[key]    build-time value (still honoured if set during build)
 *   3. caller default          local dev (localhost)
 *
 * Blank values are treated as "unset" so an empty Railway variable or the committed
 * empty dev placeholder never shadows a real value.
 *
 * NOTE: `/env.js` is excluded from the Workbox precache (see vite.config.ts
 * `globIgnores`) so the service worker never serves a stale build-time copy.
 */
declare global {
  interface Window {
    /** Injected at deploy time by /env.js; see scripts/write-runtime-env.mjs. */
    __ENV__?: Record<string, string | undefined>;
  }
}

/** Resolve a VITE_* key, runtime value winning over the build-time one. */
export function resolveEnv(key: string): string | undefined {
  const runtime = typeof window !== 'undefined' ? window.__ENV__?.[key]?.trim() : undefined;
  const buildTime = (import.meta.env as unknown as Record<string, string | undefined>)[key]?.trim();
  return runtime || buildTime || undefined;
}
