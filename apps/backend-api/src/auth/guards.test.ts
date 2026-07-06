/**
 * Unit tests for the SSE query-token fallback in {@link JwtAuthGuard} (see
 * guards.ts doc comment). Browser `EventSource` cannot set a custom
 * `Authorization` header, so `/api/me/stream` and `/api/teamlead/stream`
 * accept a `?token=` query param — but only when no header is present at all.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './guards.js';
import type { OidcTokenVerifier } from './token-verifier.js';
import { Role, type AuthenticatedRequest, type Principal } from './rbac.js';

const principal: Principal = {
  sub: 'user-1',
  employeeNo: 'ma-101',
  roles: [Role.Employee],
  claims: {},
};

function makeContext(req: AuthenticatedRequest): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(verify: (token: string) => Promise<Principal>): {
  guard: JwtAuthGuard;
  verifier: { verify: ReturnType<typeof vi.fn> };
} {
  const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
  const verifier = { verify: vi.fn(verify) };
  const guard = new JwtAuthGuard(reflector, verifier as unknown as OidcTokenVerifier);
  return { guard, verifier };
}

describe('JwtAuthGuard SSE query-token fallback', () => {
  it('(a) authenticates via ?token= when no Authorization header is present on /api/me/stream', async () => {
    const { guard, verifier } = makeGuard(async (token) => {
      expect(token).toBe('good-token');
      return principal;
    });
    const req: AuthenticatedRequest = {
      headers: {},
      url: '/api/me/stream?token=good-token',
      query: { token: 'good-token' },
    };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.principal).toEqual(principal);
    expect(verifier.verify).toHaveBeenCalledWith('good-token');
  });

  it('(b) rejects when the SSE route has neither a header nor a query token', async () => {
    const { guard, verifier } = makeGuard(async () => principal);
    const req: AuthenticatedRequest = { headers: {}, url: '/api/me/stream', query: {} };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow('Missing bearer token');
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('(b) rejects an invalid/expired query token', async () => {
    const { guard } = makeGuard(async () => {
      throw new Error('signature verification failed');
    });
    const req: AuthenticatedRequest = {
      headers: {},
      url: '/api/me/stream?token=bad-token',
      query: { token: 'bad-token' },
    };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow('Invalid or expired token');
  });

  it('(b) never accepts a query token on a non-SSE route without a header', async () => {
    const { guard, verifier } = makeGuard(async () => principal);
    const req: AuthenticatedRequest = {
      headers: {},
      url: '/api/me/today?token=sneaky',
      query: { token: 'sneaky' },
    };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow('Missing bearer token');
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('(c) prefers a valid Authorization header over a query token when both are present', async () => {
    const { guard, verifier } = makeGuard(async (token) => {
      expect(token).toBe('header-token');
      return principal;
    });
    const req: AuthenticatedRequest = {
      headers: { authorization: 'Bearer header-token' },
      url: '/api/me/stream?token=query-token',
      query: { token: 'query-token' },
    };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith('header-token');
    expect(verifier.verify).not.toHaveBeenCalledWith('query-token');
  });

  it('(c) rejects when the Authorization header is malformed, even with a valid query token present', async () => {
    const { guard, verifier } = makeGuard(async () => principal);
    const req: AuthenticatedRequest = {
      headers: { authorization: 'Basic not-a-bearer-scheme' },
      url: '/api/me/stream?token=good-token',
      query: { token: 'good-token' },
    };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow('Missing bearer token');
    expect(verifier.verify).not.toHaveBeenCalled();
  });
});
