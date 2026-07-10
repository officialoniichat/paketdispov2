import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';
import { login, logout, LoginError } from './auth.js';
import { getSession } from './session.js';

async function makeToken(claims: Record<string, unknown>, expiresIn = '1h'): Promise<string> {
  const { privateKey } = await generateKeyPair('RS256');
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).setExpirationTime(expiresIn).sign(privateKey);
}

describe('auth', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('logs in, decodes the token and persists the session', async () => {
    const token = await makeToken({ employee_no: 'ma-202', name: 'Test Tester' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token }) });
    vi.stubGlobal('fetch', fetchMock);

    const session = await login('ma-202');

    expect(session.token).toBe(token);
    expect(session.employeeNo).toBe('ma-202');
    expect(session.displayName).toBe('Test Tester');
    expect(getSession()).toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ employeeNo: 'ma-202' }),
      }),
    );
  });

  it('sends the Mitarbeiternummer as the only credential — never a PIN', async () => {
    const token = await makeToken({ employee_no: 'ma-202', name: 'Test Tester' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token }) });
    vi.stubGlobal('fetch', fetchMock);

    await login('ma-202');

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toEqual({ employeeNo: 'ma-202' });
  });

  it('throws LoginError and does not persist a session on a 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('ma-unknown')).rejects.toBeInstanceOf(LoginError);
    expect(getSession()).toBeNull();
  });

  it('logout clears the persisted session', async () => {
    const token = await makeToken({ employee_no: 'ma-202', name: 'Test Tester' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token }) }));
    await login('ma-202');

    logout();

    expect(getSession()).toBeNull();
  });
});
