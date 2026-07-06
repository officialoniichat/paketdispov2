import { defineConfig } from 'vitest/config';

// Pure logic + Dexie (fake-indexeddb) tests run in the node environment.
// React hook/component tests (`.test.tsx`) need a DOM — those files opt into
// jsdom per-file via a `// @vitest-environment jsdom` docblock rather than
// flipping the whole suite to jsdom, so plain `.test.ts` logic tests keep
// running in the cheaper, faster node environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Node 22+'s built-in localStorage throws without --localstorage-file; the
    // node test environment has no DOM either, so data/session.test.ts needs a
    // working localStorage polyfilled in. See src/test/localStorageShim.ts.
    setupFiles: ['./src/test/localStorageShim.ts'],
  },
});
