/**
 * Runtime half of the Dev-Panel gate ("Dev / Szenarien"-Admin-Tab + globales
 * Zeit-Override-Badge).
 *
 * The gate has two layers:
 *
 *   1. BUILD TIME (tree-shaking, the important one): every consumer keeps the
 *      literal expression
 *        `import.meta.env.VITE_DEV_PANEL === '0' ? false
 *           : import.meta.env.DEV || import.meta.env.VITE_DEV_PANEL === '1'`
 *      INLINE at its lazy-import site (AdminPage, AppShell). Vite statically
 *      replaces `import.meta.env.*`, Rollup folds the constant and drops the
 *      dead `import()` — a production build contains NO dev-panel code at all.
 *      The expression must stay inline: routed through an imported const,
 *      Rollup no longer eliminates the dynamic-import chunk reliably.
 *
 *   2. RUNTIME (this module): deployments that DID build the panel in (dev
 *      builds, `VITE_DEV_PANEL=1` demo builds) can still switch it off without
 *      a rebuild via the runtime env (`window.__ENV__` from /env.js — the same
 *      resolveEnv mechanism as VITE_API_BASE_URL): an explicit '0' disables.
 *
 * The backend is the real safety net either way: /api/dev answers 404 unless
 * its own DEV_PANEL env gate is on (see backend `config.dev.panelEnabled`).
 */
import { resolveEnv } from './runtimeEnv.js';

/** Runtime opt-out: false only when the (runtime) env explicitly says '0'. */
export function devPanelRuntimeEnabled(): boolean {
  return resolveEnv('VITE_DEV_PANEL') !== '0';
}
