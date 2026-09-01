import { describe, expect, it, beforeEach } from 'vitest';
import { getSession, setSession, clearSession, isSessionExpired } from './session.js';

describe('session', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns null when no session is stored', () => {
    expect(getSession()).toBeNull();
  });

  it('round-trips a session through localStorage', () => {
    const session = {
      token: 'abc.def.ghi',
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      exp: Date.now() / 1000 + 3600,
    };
    setSession(session);
    expect(getSession()).toEqual(session);
  });

  it('clearSession removes the stored session', () => {
    setSession({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: 9999999999 });
    clearSession();
    expect(getSession()).toBeNull();
  });

  it('ein zweites Fenster überschreibt die Anmeldung des ersten nicht', () => {
    // Fenster A meldet Hakan an (schreibt Tab-Sitzung + Geräte-Standard).
    const hakan = { token: 'h', employeeNo: 'ma-108', displayName: 'Hakan', exp: 9999999999 };
    setSession(hakan);
    const fensterA = sessionStorage.getItem('paket.session');

    // Fenster B: eigener sessionStorage, meldet Anna an.
    sessionStorage.clear();
    setSession({ token: 'a', employeeNo: 'ma-102', displayName: 'Anna', exp: 9999999999 });
    expect(getSession()?.employeeNo).toBe('ma-102');

    // Zurück in Fenster A: dort gilt weiterhin Hakan.
    sessionStorage.setItem('paket.session', fensterA!);
    expect(getSession()).toEqual(hakan);
  });

  it('ein frischer Tab übernimmt den Geräte-Standard als eigene Sitzung', () => {
    const session = { token: 't', employeeNo: 'ma-101', displayName: 'x', exp: 9999999999 };
    localStorage.setItem('paket.session', JSON.stringify(session));
    expect(getSession()).toEqual(session);
    expect(sessionStorage.getItem('paket.session')).toBe(JSON.stringify(session));
  });

  it('Abmelden lässt den Geräte-Standard eines anderen Kontos stehen', () => {
    localStorage.setItem(
      'paket.session',
      JSON.stringify({ token: 'h', employeeNo: 'ma-108', displayName: 'Hakan', exp: 9999999999 }),
    );
    setSession({ token: 'a', employeeNo: 'ma-102', displayName: 'Anna', exp: 9999999999 });
    localStorage.setItem(
      'paket.session',
      JSON.stringify({ token: 'h', employeeNo: 'ma-108', displayName: 'Hakan', exp: 9999999999 }),
    );

    clearSession();

    expect(sessionStorage.getItem('paket.session')).toBeNull();
    expect(JSON.parse(localStorage.getItem('paket.session')!).employeeNo).toBe('ma-108');
  });

  it('isSessionExpired is true for a past exp', () => {
    expect(isSessionExpired({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: 0 })).toBe(
      true,
    );
  });

  it('isSessionExpired is false for a future exp', () => {
    expect(
      isSessionExpired({
        token: 't',
        employeeNo: 'ma-101',
        displayName: 'x',
        exp: Date.now() / 1000 + 3600,
      }),
    ).toBe(false);
  });
});
