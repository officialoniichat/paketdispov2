import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { logger } from '../observability/logger.js';

/**
 * Shared Prisma client, managed by the Nest lifecycle. System of record for
 * cases, assignment, ZST and the workflow event log (§14.1).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: config.env === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    // Connect eagerly, but do not block boot if the DB is briefly unreachable —
    // the readiness probe (/readyz) gates traffic until it recovers (§16.3).
    try {
      await this.$connect();
    } catch (err) {
      logger.error({ err }, 'initial database connection failed; continuing (readiness will fail)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
