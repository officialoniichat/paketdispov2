import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument } from '../swagger.js';
import { logger } from '../observability/logger.js';

/**
 * Emits the OpenAPI spec to `openapi.json` without a running database.
 * Uses Nest "preview" mode, which scans decorators/metadata without
 * instantiating providers (so Prisma never connects).
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    preview: true,
    logger: false,
  });
  const document = buildOpenApiDocument(app);
  const outFile = resolve(process.cwd(), 'openapi.json');
  writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  logger.info(
    { outFile, paths: Object.keys(document.paths ?? {}).length },
    'OpenAPI spec generated',
  );
}

generate().catch((err) => {
  logger.error({ err }, 'OpenAPI generation failed');
  process.exit(1);
});
