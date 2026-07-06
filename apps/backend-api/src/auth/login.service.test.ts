import { describe, expect, it, vi } from 'vitest';
import { LoginService } from './login.service.js';
import { TokenIssuer } from './token-issuer.js';
import { hashPin } from './pin.js';
import { Role } from './rbac.js';

function buildPrismaStub(
  user: {
    employeeNo: string;
    displayName: string;
    pinHash: string | null;
    active: boolean;
    roles: { role: { name: string } }[];
  } | null,
) {
  return { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
}

describe('LoginService', () => {
  it('returns a token for a correct employeeNo/PIN pair', async () => {
    const pinHash = await hashPin('4711');
    const prisma = buildPrismaStub({
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      pinHash,
      active: true,
      roles: [{ role: { name: 'employee' } }],
    });
    const issuer = { issue: vi.fn().mockResolvedValue('signed.jwt.token') } as unknown as TokenIssuer;
    const service = new LoginService(prisma, issuer);

    const result = await service.login('ma-101', '4711');

    expect(result).toEqual({ token: 'signed.jwt.token' });
    expect(issuer.issue).toHaveBeenCalledWith({
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      roles: [Role.Employee],
    });
  });

  it('returns null for a wrong PIN', async () => {
    const pinHash = await hashPin('4711');
    const prisma = buildPrismaStub({
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      pinHash,
      active: true,
      roles: [{ role: { name: 'employee' } }],
    });
    const service = new LoginService(prisma, { issue: vi.fn() } as unknown as TokenIssuer);

    expect(await service.login('ma-101', '0000')).toBeNull();
  });

  it('returns null for an unknown employeeNo', async () => {
    const prisma = buildPrismaStub(null);
    const service = new LoginService(prisma, { issue: vi.fn() } as unknown as TokenIssuer);

    expect(await service.login('ma-999', '4711')).toBeNull();
  });

  it('returns null for an inactive employee', async () => {
    const pinHash = await hashPin('4711');
    const prisma = buildPrismaStub({
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      pinHash,
      active: false,
      roles: [{ role: { name: 'employee' } }],
    });
    const service = new LoginService(prisma, { issue: vi.fn() } as unknown as TokenIssuer);

    expect(await service.login('ma-101', '4711')).toBeNull();
  });

  it('returns null when no PIN has been set for the employee', async () => {
    const prisma = buildPrismaStub({
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      pinHash: null,
      active: true,
      roles: [{ role: { name: 'employee' } }],
    });
    const service = new LoginService(prisma, { issue: vi.fn() } as unknown as TokenIssuer);

    expect(await service.login('ma-101', '4711')).toBeNull();
  });

  it('returns identical null result whether the employeeNo is unknown or the PIN is wrong (no user enumeration)', async () => {
    const unknownPrisma = buildPrismaStub(null);
    const unknownService = new LoginService(unknownPrisma, { issue: vi.fn() } as unknown as TokenIssuer);

    const pinHash = await hashPin('4711');
    const wrongPinPrisma = buildPrismaStub({
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      pinHash,
      active: true,
      roles: [{ role: { name: 'employee' } }],
    });
    const wrongPinService = new LoginService(wrongPinPrisma, { issue: vi.fn() } as unknown as TokenIssuer);

    const unknownResult = await unknownService.login('ma-999', '4711');
    const wrongPinResult = await wrongPinService.login('ma-101', '0000');

    expect(unknownResult).toBeNull();
    expect(wrongPinResult).toBeNull();
    expect(unknownResult).toEqual(wrongPinResult);
  });
});
