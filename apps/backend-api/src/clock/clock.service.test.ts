import { describe, expect, it, vi } from 'vitest';
import { ClockService } from './clock.service.js';
import { DEV_TIME_OVERRIDE_KEY } from '../config/dev-state.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Minimal AppConfig-only Prisma stub — the clock touches nothing else. */
function prismaStub(initialValue: unknown): {
  prisma: PrismaService;
  findUnique: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
} {
  const findUnique = vi.fn(async () =>
    initialValue === null ? null : { key: DEV_TIME_OVERRIDE_KEY, value: initialValue },
  );
  const upsert = vi.fn(async () => ({}));
  const deleteMany = vi.fn(async () => ({ count: 1 }));
  const prisma = { appConfig: { findUnique, upsert, deleteMany } } as unknown as PrismaService;
  return { prisma, findUnique, upsert, deleteMany };
}

// NODE_ENV=test in vitest → config.dev.panelEnabled is true (non-production default).
describe('ClockService', () => {
  it('returns the system clock when no override row exists', async () => {
    const { prisma } = prismaStub(null);
    const clock = new ClockService(prisma);
    const before = Date.now();
    const now = await clock.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(await clock.currentOverride()).toBeNull();
  });

  it('returns the persisted override and caches the read', async () => {
    const { prisma, findUnique } = prismaStub({ nowIso: '2026-07-06T09:30:00.000Z' });
    const clock = new ClockService(prisma);
    expect((await clock.now()).toISOString()).toBe('2026-07-06T09:30:00.000Z');
    await clock.now();
    await clock.now();
    expect(findUnique).toHaveBeenCalledTimes(1); // cached after the first read
  });

  it('falls back to real time on an invalid stored value (safeParse discipline)', async () => {
    const { prisma } = prismaStub({ bogus: true });
    const clock = new ClockService(prisma);
    expect(await clock.currentOverride()).toBeNull();
  });

  it('setOverride persists and updates the cache; clearOverride removes it', async () => {
    const { prisma, upsert, deleteMany } = prismaStub(null);
    const clock = new ClockService(prisma);
    const frozen = new Date('2026-12-24T08:00:00.000Z');

    await clock.setOverride(frozen);
    expect(upsert).toHaveBeenCalledOnce();
    expect((await clock.now()).toISOString()).toBe(frozen.toISOString());

    await clock.clearOverride();
    expect(deleteMany).toHaveBeenCalledOnce();
    expect(await clock.currentOverride()).toBeNull();
  });
});
