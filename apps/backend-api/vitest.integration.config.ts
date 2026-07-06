import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Integration tests against a real Postgres (Testcontainers, Docker required).
 * Run with `pnpm --filter @paket/backend-api test:int`. Kept out of the default
 * unit run so CI without Docker stays green (concept §17.2).
 *
 * The `unplugin-swc` transform (already a devDependency, mirrors `.swcrc`'s
 * `decoratorMetadata: true`) is required here — and only here — because
 * `auth-login.int.test.ts` boots the real Nest/Fastify app via `NestFactory`.
 * Vitest's default esbuild transform strips `design:paramtypes` metadata, which
 * silently breaks Nest's implicit constructor-injection for every provider in
 * the graph (not just auth). Other `*.int.test.ts` files sidestep this by
 * hand-instantiating services directly, so they are unaffected either way.
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
  plugins: [swc.vite()],
});
