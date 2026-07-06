import { defineConfig } from 'vitest/config';

// Pure logic + Dexie (fake-indexeddb) tests run in the node environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Node 22+'s built-in localStorage throws without --localstorage-file; the
    // node test environment has no DOM either, so data/session.test.ts needs a
    // working localStorage polyfilled in. See src/test/localStorageShim.ts.
    setupFiles: ['./src/test/localStorageShim.ts'],
  },
});
