import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config.js';
import { loggerOptions } from './observability/logger.js';
import { prisma } from './prisma.js';
import { DOMAIN_MODULES, registerModules } from './modules/index.js';

/** Build the Fastify application (modular monolith composition root). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    disableRequestLogging: false,
    genReqId: (req) => (req.headers['x-correlation-id'] as string) ?? undefined,
  });

  // Liveness – process is up.
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Readiness – dependencies reachable.
  app.get('/readyz', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', modules: DOMAIN_MODULES };
    } catch (err) {
      app.log.error({ err }, 'readiness check failed');
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  await registerModules(app);
  return app;
}

export const appMeta = { name: config.otel.serviceName } as const;
