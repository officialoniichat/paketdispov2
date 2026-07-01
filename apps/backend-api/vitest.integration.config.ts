import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Integration tests against a real Postgres (Testcontainers, Docker required).
 * Run with `pnpm --filter @paket/backend-api test:int`. Kept out of the default
 * unit run so CI without Docker stays green (concept §17.2).
 *
 * SWC transform (reads the repo `.swcrc`) so `emitDecoratorMetadata` is honoured —
 * required for any test that boots the Nest DI container / a real HTTP app (Vitest's
 * default esbuild transform drops `design:paramtypes`, which breaks constructor DI).
 */
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['src/**/*.int.test.ts'],
    // Containers + migrations are slow; allow generous startup and run serially.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
