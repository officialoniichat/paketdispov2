// Scenario framework entry point. HTTP-/Nest-free: integration tests import
// `loadScenario` directly against a Testcontainers PrismaClient; the DevModule's
// ScenarioService and prisma/seed.ts are thin adapters over the same call.
import { resetCaseGraph, summarizeScenario } from './lib.js';
import { DEFAULT_SCENARIO_KEY, SCENARIOS, findScenario } from './catalog.js';
import type { SeedScenario } from './seed-data.js';
import type { ScenarioPrisma, ScenarioSummary } from './types.js';

export { SCENARIOS, DEFAULT_SCENARIO_KEY, findScenario } from './catalog.js';
export { resetCaseGraph, seedMasterData, summarizeScenario } from './lib.js';
export type {
  ScenarioContext,
  ScenarioDefinition,
  ScenarioPrisma,
  ScenarioSummary,
} from './types.js';
export { resolveScenario, type SeedScenario } from './seed-data.js';

export interface LoadScenarioOptions {
  /** Calendar day (YYYY-MM-DD) all relative dates anchor on. Default: today. */
  baseDate?: string;
  /** Volume profile for generator-driven pools. Default: 'typical'. */
  volume?: SeedScenario;
}

/**
 * Load a scenario deterministically: wipe the transactional case graph, then run
 * the scenario's seed (master data is upserted, never wiped). Idempotent — the
 * same key + options always reproduce the same data. Throws on an unknown key;
 * API-level 404 mapping is the ScenarioService's job.
 */
export async function loadScenario(
  prisma: ScenarioPrisma,
  key: string,
  opts?: LoadScenarioOptions,
): Promise<ScenarioSummary> {
  const scenario = findScenario(key);
  if (!scenario) {
    const known = SCENARIOS.map((s) => s.key).join(', ');
    throw new Error(`[scenario] unknown scenario "${key}" (known: ${known})`);
  }
  const baseDate = opts?.baseDate ?? new Date().toISOString().slice(0, 10);
  await resetCaseGraph(prisma);
  await scenario.seed({ prisma, baseDate, volume: opts?.volume ?? 'typical' });
  return summarizeScenario(prisma, baseDate);
}
