import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

/** Shared Prisma client. System of record for cases, assignment, ZST and events. */
export const prisma = new PrismaClient({
  log: config.env === 'development' ? ['warn', 'error'] : ['error'],
});
