import { defineConfig } from 'vitest/config';

/**
 * Integration tests against a real Postgres (Testcontainers, Docker required).
 * Run with `pnpm --filter @paket/backend-api test:int`. Kept out of the default
 * unit run so CI without Docker stays green (concept §17.2).
 */
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    // Containers + migrations are slow; allow generous startup and run serially.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
