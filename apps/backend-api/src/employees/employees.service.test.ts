import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventLogService } from '../events/event-log.service.js';
import type { Principal } from '../auth/rbac.js';
import { EmployeesService } from './employees.service.js';

const PRINCIPAL = { sub: 'user-teamlead-1' } as unknown as Principal;

function buildPrismaStub(
  existingUser: unknown = { id: 'user-abc123', employeeNo: 'ma-101' },
): PrismaService {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      update: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

function buildEventsStub(): EventLogService {
  return {
    append: vi.fn().mockResolvedValue({}),
  } as unknown as EventLogService;
}

function buildFullUser(pinHash: string | null): Record<string, unknown> {
  return {
    id: 'user-abc123',
    employeeNo: 'ma-101',
    displayName: 'Anna Berger',
    active: true,
    measured: true,
    bereiche: [],
    productivityFactor: 1,
    overtimeTolerancePct: 0,
    skillTier: 'profi',
    workstationId: null,
    workstation: null,
    weeklyPattern: null,
    roles: [],
    shifts: [],
    pinHash,
  };
}

describe('EmployeesService.get — hasPinSet derivation', () => {
  it('reports hasPinSet true when the user has a pinHash, without ever exposing it', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(buildFullUser('$2b$12$somehash')) },
      workflowEvent: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new EmployeesService(prisma, buildEventsStub());

    const detail = await service.get('user-abc123');

    expect(detail.hasPinSet).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('$2b$12$somehash');
  });

  it('reports hasPinSet false when no PIN has been set yet', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(buildFullUser(null)) },
      workflowEvent: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new EmployeesService(prisma, buildEventsStub());

    const detail = await service.get('user-abc123');

    expect(detail.hasPinSet).toBe(false);
  });
});

describe('EmployeesService.resetPin', () => {
  it('hashes the PIN and stores it via the Prisma id, without emitting the plaintext PIN', async () => {
    const prisma = buildPrismaStub();
    const events = buildEventsStub();
    const service = new EmployeesService(prisma, events);

    await service.resetPin(PRINCIPAL, 'user-abc123', '4711');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-abc123' } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-abc123' },
      data: { pinHash: expect.any(String) },
    });
    const [[updateArgs]] = prisma.user.update.mock.calls;
    expect(updateArgs.data.pinHash).not.toBe('4711');

    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'employee.pin_reset',
        entityId: 'user-abc123',
        actorType: 'teamlead',
        actorId: 'user-teamlead-1',
      }),
    );
    const [[eventArgs]] = events.append.mock.calls;
    expect(JSON.stringify(eventArgs)).not.toContain('4711');
  });

  it('throws NotFoundException when the Prisma id does not resolve to a user', async () => {
    const prisma = buildPrismaStub(null);
    const events = buildEventsStub();
    const service = new EmployeesService(prisma, events);

    await expect(service.resetPin(PRINCIPAL, 'missing-id', '4711')).rejects.toThrow(
      'Employee missing-id not found',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(events.append).not.toHaveBeenCalled();
  });
});
