import { standardScenario } from './standard.js';
import type { ScenarioDefinition } from './types.js';

/**
 * Typed scenario registry — the single source the dev panel, the seed script and
 * the integration tests read. Phase 3 adds the remaining B2–B15 definitions here;
 * each scenario lives in its own file next to `standard.ts`.
 */
export const SCENARIOS: readonly ScenarioDefinition[] = [standardScenario];

/** The scenario `POST /api/dev/scenarios/reset` and `prisma db seed` load. */
export const DEFAULT_SCENARIO_KEY = standardScenario.key;

export function findScenario(key: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.key === key);
}
