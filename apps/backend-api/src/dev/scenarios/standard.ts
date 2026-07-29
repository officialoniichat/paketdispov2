import { generateReadyCases } from './seed-data.js';
import { seedMasterData } from './lib.js';
import {
  seedCaseDetails,
  seedCases,
  seedGeneratedBelege,
  seedIntakeGateFixtures,
  seedLifecycleCases,
  seedLifecycleIssues,
  seedMa108DemoBundle,
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
    'alle Scopes, Mock-ProHandel-Charge, Intake-Gate- und Pool-Hold-Fixtures sowie ' +
    'das direkt zugewiesene MA-108-Demo-Bündel (8 Belege, 4 Stops, alle Bereiche/' +
    'Warenarten, Liefergruppe ×3, Fertig-/Problem-/Geklärt-Zustände).',
  expectedOutcome:
    'Pool ≈ 189 ready-Belege (171 generiert + 16 Mock-ProHandel + 2 Pool-Hold), ' +
    '2 blockierte Belege („zurück an Bucher"), ~60 Liefergruppen, gefüllte Ablage-Lanes; ' +
    'ma-108 (PWA-Demo-Login) hat sofort sein 8-Beleg-Bündel; nach „Neu berechnen" ein ' +
    'voller Tagesplan über alle Schichten (die unbegonnenen MA-108-Belege werden dabei ' +
    'systemkonform neu verplant).',
  async seed(ctx) {
    const readyCases = generateReadyCases(ctx.volume);
    const specByWeBelegNo = new Map(readyCases.map((c) => [c.weBelegNo, c]));

    const { userIds, locationIds } = await seedMasterData(ctx);
    await seedCases(ctx.prisma, ctx.baseDate, locationIds, readyCases);
    await seedLifecycleCases(ctx.prisma, ctx.baseDate, locationIds, userIds);
    // After both case sets exist, attach detail (positions/boxes/SKU) to every case
    // that should show it — generated ready pool + lifecycle cases.
    await seedCaseDetails(ctx.prisma, specByWeBelegNo);
    // Probleme hängen an einer Position (Kundenfeedback 14.07.2026) — deshalb
    // erst NACH den Detail-Daten an die erste Position des Belegs anhängen.
    await seedLifecycleIssues(ctx.prisma, userIds);
    // MA-108-Demo-Bündel NACH seedCaseDetails: seine Belege tragen eigene,
    // explizite Positionen/Größen (siehe Builder-Doku in case-builders.ts).
    await seedMa108DemoBundle(ctx.prisma, ctx.baseDate, locationIds, userIds);
    // Generated mock-ProHandel batch ON TOP of the generated pool (runs after
    // seedCaseDetails so its richer positions/boxes are not overwritten).
    await seedGeneratedBelege(ctx.prisma, ctx.baseDate, locationIds);
    await seedIntakeGateFixtures(ctx.prisma, ctx.baseDate, locationIds);
    await seedReadyAttentionFlag(ctx.prisma);
  },
};
