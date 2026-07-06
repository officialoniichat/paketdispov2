// Prisma dev seed (§14.1) — thin wrapper over the scenario framework: loads the
// 'standard' scenario (src/dev/scenarios/), i.e. the realistic ready-pool from the
// customer's real volume profile plus lifecycle/intake fixtures. Deterministic and
// idempotent; the same framework backs the /api/dev scenario panel and the
// integration tests, so `prisma db seed` and "Szenario laden" produce identical data.
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
