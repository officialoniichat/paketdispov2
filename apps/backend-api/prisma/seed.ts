// Prisma dev seed (§14.1) — thin wrapper over the scenario framework: loads the
// 'standard' scenario (src/dev/scenarios/), i.e. the realistic ready-pool from the
// customer's real volume profile plus lifecycle/intake fixtures. The same framework
// backs the /api/dev scenario panel and the integration tests, so `prisma db seed`
// and "Szenario laden" produce identical data.
//
// DESTRUCTIVE — "deterministic and idempotent" describes the RESULT (same inputs →
// same data), not preservation of what was there before. Only master data (roles,
// users, workstations, locations, catalogs, rule config) is upserted. Every run:
//   * wipes the transactional case graph — resetCaseGraph (src/dev/scenarios/lib.ts)
//     deletes zstRecord, assignmentItem, assignmentBundle and goodsReceiptCase, which
//     cascades into positions, SKU lines, transport boxes and issues;
//   * deactivates every Lagerplatz outside the seed set (seedLocations).
// Belege and Lagerplätze a customer entered do NOT survive a seed. The Verladeplan
// (LoadPlanRule) and the RuleConfig do — seedRuleConfig only writes a missing row.
//
// Therefore the seed never runs unattended against production: railway.json invokes
// it pre-deploy only when SEED_ON_DEPLOY=1, and the guard below refuses to wipe a
// production database without that flag. See docs/deploy/railway.md.
//
// Run from apps/backend-api so prisma.config.ts loads DATABASE_URL:
//   pnpm --filter @paket/backend-api exec prisma db seed
//   SEED_SCENARIO=peak pnpm --filter @paket/backend-api exec prisma db seed
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_SCENARIO_KEY,
  loadScenario,
  resolveScenario,
} from '../src/dev/scenarios/index.js';

if (process.env.NODE_ENV === 'production' && process.env.SEED_ON_DEPLOY !== '1') {
  console.error(
    '[seed] refused: this seed wipes the case graph and deactivates every Lagerplatz ' +
      'outside the seed set. Set SEED_ON_DEPLOY=1 to run it against production.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const volume = resolveScenario(process.env.SEED_SCENARIO);

loadScenario(prisma, DEFAULT_SCENARIO_KEY, { volume })
  .then(async (s) => {
    console.log(
      `[seed] scenario=${DEFAULT_SCENARIO_KEY} volume=${volume} users=${s.users} ` +
        `shifts=${s.shifts} activeLocations=${s.activeLocations} readyCases=${s.readyCases} ` +
        `blockedCases=${s.blockedCases} deliveryGroups=${s.deliveryGroups} totalCases=${s.totalCases}`,
    );
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[seed] failed', err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
