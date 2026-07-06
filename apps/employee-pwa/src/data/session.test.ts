import { describe, expect, it, beforeEach } from 'vitest';
import { getSession, setSession, clearSession, isSessionExpired } from './session.js';

describe('session', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no session is stored', () => {
    expect(getSession()).toBeNull();
  });

  it('round-trips a session through localStorage', () => {
    const session = { token: 'abc.def.ghi', employeeNo: 'ma-101', displayName: 'Mitarbeiter 101', exp: Date.now() / 1000 + 3600 };
    setSession(session);
    expect(getSession()).toEqual(session);
  });

  it('clearSession removes the stored session', () => {
    setSession({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: 9999999999 });
    clearSession();
    expect(getSession()).toBeNull();
  });

  it('isSessionExpired is true for a past exp', () => {
    expect(isSessionExpired({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: 0 })).toBe(true);
  });

  it('isSessionExpired is false for a future exp', () => {
    expect(isSessionExpired({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: Date.now() / 1000 + 3600 })).toBe(false);
  });
});
