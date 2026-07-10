import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LoginService } from './login.service.js';
import { TokenIssuer } from './token-issuer.js';
import { hashPin } from './pin.js';
import { Role } from './rbac.js';

interface StubUser {
  employeeNo: string;
  displayName: string;
  pinHash: string | null;
  active: boolean;
  roles: { role: { name: string } }[];
}

function buildPrismaStub(user: StubUser | null): PrismaService {
  return { user: { findUnique: vi.fn().mockResolvedValue(user) } } as unknown as PrismaService;
}

function buildIssuerStub(token = 'signed.jwt.token'): TokenIssuer {
  return { issue: vi.fn().mockResolvedValue(token) } as unknown as TokenIssuer;
}

/** A Mitarbeiter/in: role `employee`, and therefore no `pinHash` at all. */
function employee(overrides: Partial<StubUser> = {}): StubUser {
  return {
    employeeNo: 'ma-101',
    displayName: 'Mitarbeiter 101',
    pinHash: null,
    active: true,
    roles: [{ role: { name: 'employee' } }],
    ...overrides,
  };
}

async function teamlead(overrides: Partial<StubUser> = {}): Promise<StubUser> {
  return {
    employeeNo: 'tl-001',
    displayName: 'TL Logistik',
    pinHash: await hashPin('0000'),
    active: true,
    roles: [{ role: { name: 'teamlead' } }],
    ...overrides,
  };
}

describe('LoginService — Mitarbeiterrolle (no secret required)', () => {
  it('issues a token for the Mitarbeiternummer alone', async () => {
    const issuer = buildIssuerStub();
    const service = new LoginService(buildPrismaStub(employee()), issuer);

    const result = await service.login('ma-101');

    expect(result).toEqual({ token: 'signed.jwt.token' });
    expect(issuer.issue).toHaveBeenCalledWith({
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      roles: [Role.Employee],
    });
  });

  it('issues a token for a user with no role rows at all (defaults to employee)', async () => {
    const service = new LoginService(buildPrismaStub(employee({ roles: [] })), buildIssuerStub());

    expect(await service.login('ma-101')).toEqual({ token: 'signed.jwt.token' });
  });

  it('ignores a PIN that is sent anyway', async () => {
    const service = new LoginService(buildPrismaStub(employee()), buildIssuerStub());

    expect(await service.login('ma-101', '9999')).toEqual({ token: 'signed.jwt.token' });
  });

  it('returns null for an unknown employeeNo', async () => {
    const service = new LoginService(buildPrismaStub(null), buildIssuerStub());

    expect(await service.login('ma-999')).toBeNull();
  });

  it('returns null for an inactive employee', async () => {
    const service = new LoginService(buildPrismaStub(employee({ active: false })), buildIssuerStub());

    expect(await service.login('ma-101')).toBeNull();
  });
});

describe('LoginService — privileged roles (PIN required)', () => {
  it('issues a token for a teamlead with the correct PIN', async () => {
    const issuer = buildIssuerStub();
    const service = new LoginService(buildPrismaStub(await teamlead()), issuer);

    const result = await service.login('tl-001', '0000');

    expect(result).toEqual({ token: 'signed.jwt.token' });
    expect(issuer.issue).toHaveBeenCalledWith({
      employeeNo: 'tl-001',
      displayName: 'TL Logistik',
      roles: [Role.Teamlead],
    });
  });

  it('returns null for a teamlead with a wrong PIN', async () => {
    const service = new LoginService(buildPrismaStub(await teamlead()), buildIssuerStub());

    expect(await service.login('tl-001', '1234')).toBeNull();
  });

  it('returns null for a teamlead who sends no PIN — the number alone never suffices', async () => {
    const service = new LoginService(buildPrismaStub(await teamlead()), buildIssuerStub());

    expect(await service.login('tl-001')).toBeNull();
  });

  it('returns null for a privileged user with no pinHash — never falls through to a PIN-less login', async () => {
    const admin: StubUser = {
      employeeNo: 'admin-001',
      displayName: 'Admin',
      pinHash: null,
      active: true,
      roles: [{ role: { name: 'admin' } }],
    };

    const withoutPin = new LoginService(buildPrismaStub(admin), buildIssuerStub());
    const withPin = new LoginService(buildPrismaStub(admin), buildIssuerStub());

    expect(await withoutPin.login('admin-001')).toBeNull();
    expect(await withPin.login('admin-001', '0000')).toBeNull();
  });

  it('requires the PIN when a user holds both the employee and a privileged role', async () => {
    const roles = [{ role: { name: 'employee' } }, { role: { name: 'teamlead' } }];
    const withoutPin = new LoginService(buildPrismaStub(await teamlead({ roles })), buildIssuerStub());
    const withPin = new LoginService(buildPrismaStub(await teamlead({ roles })), buildIssuerStub());

    expect(await withoutPin.login('tl-001')).toBeNull();
    expect(await withPin.login('tl-001', '0000')).toEqual({ token: 'signed.jwt.token' });
  });

  it('returns an identical null result whether the employeeNo is unknown or the PIN is wrong (no user enumeration)', async () => {
    const unknownService = new LoginService(buildPrismaStub(null), buildIssuerStub());
    const wrongPinService = new LoginService(buildPrismaStub(await teamlead()), buildIssuerStub());

    const unknownResult = await unknownService.login('tl-999', '0000');
    const wrongPinResult = await wrongPinService.login('tl-001', '1234');

    expect(unknownResult).toBeNull();
    expect(wrongPinResult).toBeNull();
    expect(unknownResult).toEqual(wrongPinResult);
  });
});
