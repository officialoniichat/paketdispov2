import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { DEV_TIME_OVERRIDE_KEY, devTimeOverrideSchema } from '../config/dev-state.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Request-path clock. `now()` returns the persisted dev time override (AppConfig
 * key {@link DEV_TIME_OVERRIDE_KEY}) when the dev panel is enabled and an override
 * is set, else the real system time. Controllers resolve `now` here and pass it
 * into the services' already-injectable `now` parameters — the services and the
 * pure engine stay clock-free.
 *
 * The override is cached in-memory after the first read; the /api/dev endpoints
 * write and clear it exclusively THROUGH this service, which keeps the cache
 * coherent (single-instance dev deployments only — exactly the dev-panel scope).
 * With `config.dev.panelEnabled` off the database is never consulted: production
 * always runs on the real clock.
 */
@Injectable()
export class ClockService {
  /** `undefined` = not loaded yet; `null` = no override active. */
  private cachedOverride: Date | null | undefined;

  constructor(private readonly prisma: PrismaService) {}

  /** The effective "now": the dev override when active, else the system clock. */
  async now(): Promise<Date> {
    return (await this.currentOverride()) ?? new Date();
  }

  /** The active override, or null when none is set (or the dev panel is off). */
  async currentOverride(): Promise<Date | null> {
    if (!config.dev.panelEnabled) return null;
    if (this.cachedOverride === undefined) {
      this.cachedOverride = await this.readOverride();
    }
    return this.cachedOverride;
  }

  /** Persist + activate an override (dev panel "Zeit einfrieren"). */
  async setOverride(now: Date): Promise<void> {
    const value = { nowIso: now.toISOString() } satisfies Prisma.InputJsonValue;
    await this.prisma.appConfig.upsert({
      where: { key: DEV_TIME_OVERRIDE_KEY },
      update: { value },
      create: { key: DEV_TIME_OVERRIDE_KEY, value },
    });
    this.cachedOverride = now;
  }

  /** Remove the override — back to real time. Idempotent. */
  async clearOverride(): Promise<void> {
    await this.prisma.appConfig.deleteMany({ where: { key: DEV_TIME_OVERRIDE_KEY } });
    this.cachedOverride = null;
  }

  private async readOverride(): Promise<Date | null> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: DEV_TIME_OVERRIDE_KEY },
    });
    const parsed = devTimeOverrideSchema.safeParse(row?.value);
    return parsed.success ? new Date(parsed.data.nowIso) : null;
  }
}
