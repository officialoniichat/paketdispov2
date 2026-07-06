import { z } from 'zod';

/**
 * Persisted dev-panel state in the generic AppConfig key→JSON store (§11 pattern,
 * same safeParse-with-fallback discipline as `rule-config.ts`). Both keys are
 * DEV-ONLY: they are written exclusively by the /api/dev surface (env-gated) and
 * an invalid/missing row always degrades to "no override / no scenario".
 */

/** AppConfig key: the server-side time override (Zeitreise for demos/scenarios). */
export const DEV_TIME_OVERRIDE_KEY = 'dev_time_override';

/** AppConfig key: which dev scenario the case graph currently reflects. */
export const DEV_CURRENT_SCENARIO_KEY = 'dev_current_scenario';

/** Stored value under {@link DEV_TIME_OVERRIDE_KEY}. */
export const devTimeOverrideSchema = z.object({
  /** The frozen "now" as an ISO-8601 timestamp. */
  nowIso: z.string().datetime({ offset: true }),
});
export type DevTimeOverride = z.infer<typeof devTimeOverrideSchema>;

/** Stored value under {@link DEV_CURRENT_SCENARIO_KEY}. */
export const devCurrentScenarioSchema = z.object({
  /** Scenario key from the catalog (e.g. 'standard'). */
  key: z.string().min(1),
});
export type DevCurrentScenario = z.infer<typeof devCurrentScenarioSchema>;
