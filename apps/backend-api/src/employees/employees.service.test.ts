import { describe, expect, it, vi } from 'vitest';
import { EmployeesService } from './employees.service.js';

const PRINCIPAL = { sub: 'user-teamlead-1' } as any;

function buildPrismaStub(existingUser: unknown = { id: 'user-abc123', employeeNo: 'ma-101' }) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

function buildEventsStub() {
  return {
    append: vi.fn().mockResolvedValue({}),
  } as any;
}

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
