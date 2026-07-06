/**
 * Dev-Panel data layer (Admin-Tab "Dev / Szenarien" + Zeit-Override-Badge).
 *
 * Talks to the env-gated `/api/dev/*` surface (backend DevModule; 404 when the
 * backend's DEV_PANEL gate is off) plus the two existing quick-knob endpoints
 * (mock-ProHandel pull, recalculate). `/api/dev` is Admin-only, but the cockpit's
 * regular dev token is a Teamlead token — `pnpm dev:setup` therefore mints an
 * additional Admin dev token (`VITE_DEV_ADMIN_TOKEN`) that ONLY this module uses;
 * everything else keeps acting as the Teamlead. Backend roles stay untouched.
 *
 * This module is only reachable through the lazily imported dev-panel chunks
 * (DevScenariosTab, DevTimeBadge), so it is tree-shaken out of production
 * builds together with them (see ../config/devPanel.ts).
 */
import { createApiClient, type components } from '@paket/api-client';
import { resolveEnv } from '../config/runtimeEnv.js';
import { api, apiBaseUrl } from './api.js';
import { unwrap } from './http.js';

export type DevScenariosDto = components['schemas']['DevScenariosDto'];
export type ScenarioInfoDto = components['schemas']['ScenarioInfoDto'];
export type ScenarioLoadResultDto = components['schemas']['ScenarioLoadResultDto'];
export type TimeOverrideStateDto = components['schemas']['TimeOverrideStateDto'];
export type MaterializeShiftsResultDto = components['schemas']['MaterializeShiftsResultDto'];
export type ProhandelPullResultDto = components['schemas']['ProhandelPullResultDto'];
export type RecalculateResultDto = components['schemas']['RecalculateResultDto'];

/** Shared TanStack Query key for the dev state (catalog + active key + override). */
export const DEV_STATE_QUERY_KEY = ['dev', 'scenarios'] as const;

/**
 * Admin-token client for `/api/dev/*`. Falls back to the regular Teamlead token
 * when no admin token is configured (the backend then answers 403 — surfaced as
 * a normal query/mutation error, never silently swallowed).
 */
const devApi = createApiClient({
  baseUrl: apiBaseUrl,
  token: resolveEnv('VITE_DEV_ADMIN_TOKEN') ?? resolveEnv('VITE_DEV_TOKEN'),
});

// --- Scenario catalog + state ------------------------------------------------

/** Catalog + active scenario + time-override state (single backend source). */
export async function fetchDevState(): Promise<DevScenariosDto> {
  return unwrap(await devApi.GET('/api/dev/scenarios'), 'dev state');
}

/** One-click load: reset the case graph + seed the scenario deterministically. */
export async function loadScenario(key: string): Promise<ScenarioLoadResultDto> {
  return unwrap(
    await devApi.POST('/api/dev/scenarios/{key}/load', { params: { path: { key } } }),
    `Szenario ${key}`,
  );
}

/** "Zurücksetzen auf Standard" — load the default scenario. */
export async function resetScenario(): Promise<ScenarioLoadResultDto> {
  return unwrap(await devApi.POST('/api/dev/scenarios/reset'), 'Szenario-Reset');
}

// --- Time override -------------------------------------------------------------

/** Freeze the server "now" (persisted server-side). */
export async function setTimeOverride(nowIso: string): Promise<TimeOverrideStateDto> {
  return unwrap(
    await devApi.POST('/api/dev/time-override', { body: { now: nowIso } }),
    'Zeit-Override',
  );
}

/** Back to real time. */
export async function clearTimeOverride(): Promise<TimeOverrideStateDto> {
  return unwrap(await devApi.DELETE('/api/dev/time-override'), 'Zeit-Override löschen');
}

// --- Quick knobs -----------------------------------------------------------------

/** Materialize every active employee's shift for the date from their pattern. */
export async function materializeShifts(date: string): Promise<MaterializeShiftsResultDto> {
  return unwrap(
    await devApi.POST('/api/dev/materialize-shifts', { body: { date } }),
    'Schichten materialisieren',
  );
}

/** Mock-ProHandel delta pull (regular admin endpoint, Teamlead token suffices). */
export async function pullProhandel(): Promise<ProhandelPullResultDto> {
  return unwrap(await api.POST('/api/admin/integrations/prohandel/pull'), 'ProHandel-Pull');
}

/** Persist a fresh assignment-engine run for the date (regular endpoint). */
export async function recalculateAssignments(date: string): Promise<RecalculateResultDto> {
  return unwrap(
    await api.POST('/api/teamlead/assignments/recalculate', { body: { date } }),
    'Neuberechnung',
  );
}
