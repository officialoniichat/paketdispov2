import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** jsdom + React Testing Library config for component render tests. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
