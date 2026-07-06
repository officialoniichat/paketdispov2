import { generateReadyCases } from './seed-data.js';
import { seedMasterData } from './lib.js';
import {
  seedCaseDetails,
  seedCases,
  seedGeneratedBelege,
  seedIntakeGateFixtures,
  seedLifecycleCases,
  seedReadyAttentionFlag,
} from './case-builders.js';
import type { ScenarioDefinition } from './types.js';

/**
 * B1 'standard' — the realistic default day (formerly the whole prisma/seed.ts):
 * the generated ready pool from the customer's real volume profile (ctx.volume:
 * 'typical' 171 / 'peak' 315), full case details, lifecycle fixtures for every
 * Belege scope, a mock-ProHandel batch and the Intake-Gate/Lieferungs-Hold demos.
 */
export const standardScenario: ScenarioDefinition = {
  key: 'standard',
  name: 'Standard-Tag',
  description:
    'Realistischer Arbeitstag aus dem echten Volumenprofil: generierter Ready-Pool ' +
    '(typisch 171 Belege) über alle Bereiche, Lieferungs-Runs, Lifecycle-Belege für ' +
    'alle Scopes, Mock-ProHandel-Charge sowie Intake-Gate- und Pool-Hold-Fixtures.',
  expectedOutcome:
    'Pool ≈ 189 ready-Belege (171 generiert + 16 Mock-ProHandel + 2 Pool-Hold), ' +
    '2 blockierte Belege („zurück an Bucher"), ~60 Liefergruppen, gefüllte Ablage-Lanes; ' +
    'nach „Neu berechnen" ein voller Tagesplan über alle Schichten.',
  async seed(ctx) {
    const readyCases = generateReadyCases(ctx.volume);
    const specByWeBelegNo = new Map(readyCases.map((c) => [c.weBelegNo, c]));

    const { userIds, locationIds } = await seedMasterData(ctx);
    await seedCases(ctx.prisma, ctx.baseDate, locationIds, readyCases);
    await seedLifecycleCases(ctx.prisma, ctx.baseDate, locationIds, userIds);
    // After both case sets exist, attach detail (positions/boxes/SKU) to every case
    // that should show it — generated ready pool + lifecycle cases.
    await seedCaseDetails(ctx.prisma, specByWeBelegNo);
    // Generated mock-ProHandel batch ON TOP of the generated pool (runs after
    // seedCaseDetails so its richer positions/boxes are not overwritten).
    await seedGeneratedBelege(ctx.prisma, ctx.baseDate, locationIds);
    await seedIntakeGateFixtures(ctx.prisma, ctx.baseDate, locationIds);
    await seedReadyAttentionFlag(ctx.prisma);
  },
};
