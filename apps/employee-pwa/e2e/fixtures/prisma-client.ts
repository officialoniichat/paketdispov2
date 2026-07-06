/**
 * Re-exports the ALREADY-GENERATED `@prisma/client` from `apps/backend-api`
 * (its own `pnpm build` / `prisma generate` produces it; this harness
 * triggers that build itself — see `backend-server.ts`) via a relative import
 * instead of adding `@prisma/client` + `prisma` as employee-pwa
 * devDependencies.
 *
 * Rationale: `@prisma/client` is a *generated* package — the generated query
 * engine/DMMF lives wherever `prisma generate` resolved `@prisma/client` from
 * (here: `apps/backend-api/node_modules/@prisma/client`, matching its
 * `prisma/schema.prisma`). Installing a second, ungenerated copy under
 * `apps/employee-pwa` would just throw ("did you forget to run prisma
 * generate?") unless we ran generate a second time — which would need to
 * target backend-api's schema anyway and would likely still resolve back to
 * backend-api's own node_modules (Prisma resolves `@prisma/client` by
 * climbing from the schema file's directory, not the invoking CLI's cwd).
 * Reaching into the already-built copy directly is simpler and avoids any
 * ambiguity about which copy is authoritative.
 */
export { PrismaClient } from '../../../backend-api/node_modules/@prisma/client/index.js';
