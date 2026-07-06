import type { PrismaClient } from '@prisma/client';
import type { SeedScenario } from './seed-data.js';

/**
 * Scenario framework contract. A scenario is a deterministic, idempotent
 * description of ONE demo/test world: `loadScenario` wipes the transactional
 * case graph, then the scenario's `seed` rebuilds it (master data is upserted,
 * never wiped). Everything is a pure function of the seeded RNG + `baseDate`,
 * so the same key always reproduces the same data.
 *
 * The framework is HTTP-/Nest-free on purpose: integration tests import
 * `loadScenario` directly against a Testcontainers PrismaClient, and the
 * DevModule's ScenarioService is only a thin API adapter over it.
 */

/** Any Prisma client — the app's PrismaService extends PrismaClient. */
export type ScenarioPrisma = PrismaClient;

export interface ScenarioContext {
  prisma: ScenarioPrisma;
  /** Calendar day (YYYY-MM-DD) every relative date anchors on. Defaults to today. */
  baseDate: string;
  /** Volume profile for generator-driven pools ('typical' 171 / 'peak' 315). */
  volume: SeedScenario;
}

export interface ScenarioDefinition {
  /** Stable catalog key (URL-safe, e.g. 'standard'). */
  key: string;
  /** Short human name shown in the dev panel. */
  name: string;
  /** What this scenario sets up. */
  description: string;
  /** "Was man danach sehen sollte" — the headline expectation to verify. */
  expectedOutcome: string;
  /** Build the scenario's case graph. Runs AFTER the framework's reset. */
  seed(ctx: ScenarioContext): Promise<void>;
}

/** Headline counts returned by `loadScenario` (and the POST …/load response). */
export interface ScenarioSummary {
  users: number;
  shifts: number;
  activeLocations: number;
  readyCases: number;
  blockedCases: number;
  deliveryGroups: number;
  totalCases: number;
}
