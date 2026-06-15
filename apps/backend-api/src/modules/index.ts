import type { FastifyInstance } from 'fastify';

/**
 * Fachliche Modulgrenzen des modularen Monolithen (§12.3).
 * Each domain module is registered as an isolated Fastify plugin under /api.
 * EPIC 3+ fill these with controllers/services; here they are wired stubs so the
 * boundaries exist from day one.
 */
export const DOMAIN_MODULES = [
  'document',
  'workflow',
  'assignment',
  'route',
  'issue',
  'print',
  'reporting',
  'admin',
] as const;

export type DomainModule = (typeof DOMAIN_MODULES)[number];

export async function registerModules(app: FastifyInstance): Promise<void> {
  for (const name of DOMAIN_MODULES) {
    await app.register(
      async (scope) => {
        scope.get('/__status', async () => ({ module: name, status: 'registered' }));
      },
      { prefix: `/api/${name}` },
    );
  }
}
