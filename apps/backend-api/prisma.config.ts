import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load the monorepo-root .env so DATABASE_URL is available regardless of cwd.
loadEnv({ path: path.resolve(process.cwd(), '../../.env') });
loadEnv(); // also pick up a local .env if present (overrides nothing already set)

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
});
