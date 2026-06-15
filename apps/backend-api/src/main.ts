import { startTelemetry, stopTelemetry } from './observability/otel.js';
import { logger } from './observability/logger.js';
import { config } from './config.js';
import { buildApp } from './app.js';
import { prisma } from './prisma.js';

async function main(): Promise<void> {
  startTelemetry();
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await prisma.$disconnect();
    await stopTelemetry();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
  logger.info({ host: config.host, port: config.port }, 'backend-api listening');
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
