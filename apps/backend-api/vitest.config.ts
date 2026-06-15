import { defineConfig } from 'vitest/config';

/**
 * Default (unit) test run. Auto-loaded by `vitest run` from the package root.
 * Integration tests (*.int.test.ts, Docker required) are excluded here and run
 * via vitest.integration.config.ts so the CI unit run stays fast & Docker-free.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.int.test.ts'],
  },
});
