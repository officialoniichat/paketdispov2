import { describe, expect, it, vi } from 'vitest';
import { EmployeesService } from './employees.service.js';

function buildPrismaStub() {
  return {
    user: {
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
  it('hashes the PIN and stores it, without emitting the plaintext PIN', async () => {
    const prisma = buildPrismaStub();
    const events = buildEventsStub();
    const service = new EmployeesService(prisma, events);

    await service.resetPin('ma-101', '4711');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { employeeNo: 'ma-101' },
      data: { pinHash: expect.any(String) },
    });
    const [[updateArgs]] = prisma.user.update.mock.calls;
    expect(updateArgs.data.pinHash).not.toBe('4711');

    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'employee.pin_reset' }),
    );
    const [[eventArgs]] = events.append.mock.calls;
    expect(JSON.stringify(eventArgs)).not.toContain('4711');
  });
});
