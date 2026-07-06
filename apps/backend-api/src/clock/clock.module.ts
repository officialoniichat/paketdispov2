import { Global, Module } from '@nestjs/common';
import { ClockService } from './clock.service.js';

/**
 * Global so every controller can resolve the effective request time (real clock,
 * or the dev panel's persisted time override) without importing the dev module.
 */
@Global()
@Module({
  providers: [ClockService],
  exports: [ClockService],
})
export class ClockModule {}
