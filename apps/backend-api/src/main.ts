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

  // Dev-only CORS so the Vite frontends (teamlead :5174, employee :5175) can call
  // the API cross-origin. Guarded to non-production; prod is same-origin / gateway.
  if (config.env !== 'production') {
    app.enableCors({
      origin: ['http://localhost:5174', 'http://localhost:5175'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'x-correlation-id'],
      credentials: true,
    });
    logger.info('dev CORS enabled for http://localhost:5174 and :5175');
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
