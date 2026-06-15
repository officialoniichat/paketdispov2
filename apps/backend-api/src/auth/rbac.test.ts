import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { SignJWT, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  Role,
  hasAnyRole,
  normaliseRole,
  type Principal,
} from './rbac.js';
import { JwtAuthGuard, RolesGuard } from './guards.js';
import { OidcTokenVerifier } from './token-verifier.js';

// --- Test doubles -----------------------------------------------------------

function makeReflector(meta: { roles?: Role[]; isPublic?: boolean }): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return meta.isPublic;
      if (key === ROLES_KEY) return meta.roles;
      return undefined;
    },
  } as unknown as Reflector;
}

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

const employee: Principal = { sub: 'u1', employeeNo: 'E-1', roles: [Role.Employee], claims: {} };
const teamlead: Principal = { sub: 'u2', employeeNo: 'T-1', roles: [Role.Teamlead], claims: {} };

// --- Role mapping -----------------------------------------------------------

describe('role normalisation (§5)', () => {
  it('maps DE + EN identity-provider strings to canonical roles', () => {
    expect(normaliseRole('mitarbeiter')).toBe(Role.Employee);
    expect(normaliseRole('Teamleiter')).toBe(Role.Teamlead);
    expect(normaliseRole('ADMIN')).toBe(Role.Admin);
    expect(normaliseRole('it-support')).toBe(Role.It);
    expect(normaliseRole('unknown-role')).toBeUndefined();
  });

  it('hasAnyRole is permissive only on empty requirement', () => {
    expect(hasAnyRole(employee, [Role.Teamlead])).toBe(false);
    expect(hasAnyRole(teamlead, [Role.Teamlead, Role.Admin])).toBe(true);
    expect(hasAnyRole(employee, [])).toBe(true);
  });
});

// --- OIDC token verifier ----------------------------------------------------

describe('OIDC token verifier (Keycloak / Entra)', () => {
  let privateKey: CryptoKey;
  let verifier: OidcTokenVerifier;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey as CryptoKey;
    verifier = new OidcTokenVerifier({
      key: pair.publicKey as CryptoKey,
      issuer: 'https://idp.example',
      audience: ['paket-api'],
      roleClaimPaths: ['realm_access.roles', 'roles'],
      employeeNoClaim: 'employee_no',
    });
  });

  const sign = (claims: Record<string, unknown>, aud = 'paket-api') =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setIssuer('https://idp.example')
      .setAudience(aud)
      .setSubject((claims.sub as string) ?? 'subject')
      .sign(privateKey);

  it('maps a Keycloak token (realm_access.roles) to a Principal', async () => {
    const token = await sign({
      sub: 'kc-1',
      realm_access: { roles: ['mitarbeiter'] },
      employee_no: 'E-100',
    });
    const principal = await verifier.verify(token);
    expect(principal.roles).toEqual([Role.Employee]);
    expect(principal.employeeNo).toBe('E-100');
    expect(principal.sub).toBe('kc-1');
  });

  it('maps an Entra token (roles claim) and falls back to preferred_username', async () => {
    const token = await sign({ sub: 'az-1', roles: ['Teamlead'], preferred_username: 'jdoe' });
    const principal = await verifier.verify(token);
    expect(principal.roles).toEqual([Role.Teamlead]);
    expect(principal.employeeNo).toBe('jdoe');
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await sign({ sub: 'x', roles: ['admin'] }, 'other-api');
    await expect(verifier.verify(token)).rejects.toBeTruthy();
  });

  it('rejects a tampered token', async () => {
    const token = await sign({ sub: 'x', roles: ['admin'] });
    await expect(verifier.verify(`${token}tampered`)).rejects.toBeTruthy();
  });
});

// --- JwtAuthGuard -----------------------------------------------------------

describe('JwtAuthGuard', () => {
  const stubVerifier = (principal: Principal | Error) =>
    ({
      verify: async () => {
        if (principal instanceof Error) throw principal;
        return principal;
      },
    }) as unknown as OidcTokenVerifier;

  it('allows public routes without a token', async () => {
    const guard = new JwtAuthGuard(makeReflector({ isPublic: true }), stubVerifier(employee));
    await expect(guard.canActivate(makeContext({ headers: {} }))).resolves.toBe(true);
  });

  it('rejects a request with no bearer token', async () => {
    const guard = new JwtAuthGuard(makeReflector({}), stubVerifier(employee));
    await expect(guard.canActivate(makeContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the principal for a valid token', async () => {
    const req: Record<string, unknown> = { headers: { authorization: 'Bearer good' } };
    const guard = new JwtAuthGuard(makeReflector({}), stubVerifier(employee));
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.principal).toBe(employee);
  });

  it('rejects when verification fails', async () => {
    const guard = new JwtAuthGuard(makeReflector({}), stubVerifier(new Error('bad')));
    const ctx = makeContext({ headers: { authorization: 'Bearer bad' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

// --- RolesGuard -------------------------------------------------------------

describe('RolesGuard (§16.1)', () => {
  it('lets a teamlead into a teamlead-only route', () => {
    const guard = new RolesGuard(makeReflector({ roles: [Role.Teamlead, Role.Admin] }));
    expect(guard.canActivate(makeContext({ principal: teamlead }))).toBe(true);
  });

  it('blocks an employee from a teamlead-only route', () => {
    const guard = new RolesGuard(makeReflector({ roles: [Role.Teamlead, Role.Admin] }));
    expect(() => guard.canActivate(makeContext({ principal: employee }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows an authenticated route with no role requirement', () => {
    const guard = new RolesGuard(makeReflector({}));
    expect(guard.canActivate(makeContext({ principal: employee }))).toBe(true);
  });

  it('bypasses public routes', () => {
    const guard = new RolesGuard(makeReflector({ isPublic: true, roles: [Role.Admin] }));
    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('rejects when no principal is present on a guarded route', () => {
    const guard = new RolesGuard(makeReflector({ roles: [Role.Employee] }));
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });
});
