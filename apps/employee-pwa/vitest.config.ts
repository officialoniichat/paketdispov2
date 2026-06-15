import { defineConfig } from 'vitest/config';

// Pure logic + Dexie (fake-indexeddb) tests run in the node environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
