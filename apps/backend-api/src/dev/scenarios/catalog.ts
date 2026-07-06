import { standardScenario } from './standard.js';
import {
  gemischtesBuendelScenario,
  peakTagScenario,
  shop31NosScenario,
  skillTiersCrewScenario,
} from './definitions/pool-scenarios.js';
import {
  lieferungUnvollstaendigScenario,
  lieferungZusammenhaengendScenario,
} from './definitions/lieferungen.js';
import { datenqualitaetScenario, grossBelegKneckiScenario } from './definitions/qualitaet.js';
import { prioLeiterScenario } from './definitions/prio-leiter.js';
import { feiertagSonderregelungScenario, schichtendeScenario } from './definitions/zeit-regeln.js';
import { onlineGroessenScenario } from './definitions/online-groessen.js';
import { leererTagScenario, problemfaelleAblageScenario } from './definitions/ablage.js';
import type { ScenarioDefinition } from './types.js';

/**
 * Typed scenario registry (B1–B15) — the single source the dev panel, the seed
 * script and the integration tests read. Ordered like the requirement list; each
 * scenario lives in a file under `./definitions/` (B1 in `./standard.ts`).
 */
export const SCENARIOS: readonly ScenarioDefinition[] = [
  standardScenario, // B1
  peakTagScenario, // B2
  gemischtesBuendelScenario, // B3
  lieferungZusammenhaengendScenario, // B4
  lieferungUnvollstaendigScenario, // B5
  datenqualitaetScenario, // B6
  grossBelegKneckiScenario, // B7
  shop31NosScenario, // B8
  prioLeiterScenario, // B9
  schichtendeScenario, // B10
  feiertagSonderregelungScenario, // B11
  skillTiersCrewScenario, // B12
  onlineGroessenScenario, // B13
  problemfaelleAblageScenario, // B14
  leererTagScenario, // B15
];

/** The scenario `POST /api/dev/scenarios/reset` and `prisma db seed` load. */
export const DEFAULT_SCENARIO_KEY = standardScenario.key;

export function findScenario(key: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.key === key);
}
