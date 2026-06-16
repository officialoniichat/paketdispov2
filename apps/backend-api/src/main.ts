import 'reflect-metadata';
import type { IncomingMessage } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { startTelemetry, stopTelemetry } from './observability/otel.js';
import { loggerOptions, logger } from './observability/logger.js';
import { config } from './config.js';
import { AppModule } from './app.module.js';
import { setupSwagger } from './swagger.js';

async function main(): Promise<void> {
  startTelemetry();

  const adapter = new FastifyAdapter({
    logger: loggerOptions,
    genReqId: (req: IncomingMessage) => (req.headers['x-correlation-id'] as string) ?? undefined,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS for the browser frontends (teamlead-web, employee-pwa). In production set
  // CORS_ORIGINS to the deployed web app origins (comma-separated), e.g.
  //   CORS_ORIGINS=https://teamlead-web.up.railway.app,https://employee-pwa.up.railway.app
  // A "Failed to fetch" in the cockpit is often a CORS block, not just a wrong URL, so
  // the origins must match the frontends exactly (scheme + host). Trailing slashes are
  // tolerated and CORS_ORIGINS=* reflects any origin (handy for a quick demo). Without
  // CORS_ORIGINS prod stays same-origin; locally the dev origins keep things zero-config.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '')) // tolerate trailing slashes from dashboards
    .filter(Boolean);
  const allowAnyOrigin = corsOrigins.includes('*');
  const allowedOrigins =
    corsOrigins.length > 0 ? corsOrigins : ['http://localhost:5174', 'http://localhost:5175'];
  if (config.env !== 'production' || corsOrigins.length > 0) {
    app.enableCors({
      origin: allowAnyOrigin ? true : allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'x-correlation-id'],
      credentials: true,
    });
    logger.info({ origins: allowAnyOrigin ? '*' : allowedOrigins }, 'CORS enabled');
  }

  app.enableShutdownHooks();

  if (config.swagger.enabled) {
    setupSwagger(app, config.swagger.path);
    logger.info({ path: `/${config.swagger.path}` }, 'OpenAPI docs mounted');
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await stopTelemetry();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
  logger.info({ host: config.host, port: config.port }, 'backend-api listening (NestJS + Fastify)');
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
