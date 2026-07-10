import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleApiResponse, SessionExpiredError } from './apiErrorHandling.js';
import { getSession, onSessionCleared, setSession } from './session.js';

function makeResponse(status: number): Response {
  return new Response(null, { status });
}

describe('handleApiResponse', () => {
  beforeEach(() => localStorage.clear());

  it('returns the data on a successful response', () => {
    const result = handleApiResponse({ response: makeResponse(200), data: { ok: true } });
    expect(result).toEqual({ ok: true });
  });

  it('throws a SessionExpiredError and clears the session on a 401', () => {
    setSession({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: 9999999999 });

    expect(() => handleApiResponse({ response: makeResponse(401) })).toThrow(SessionExpiredError);
    expect(getSession()).toBeNull();
  });

  it('notifies onSessionCleared subscribers when a 401 clears the session', () => {
    const listener = vi.fn();
    const unsubscribe = onSessionCleared(listener);

    expect(() => handleApiResponse({ response: makeResponse(401) })).toThrow(SessionExpiredError);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('throws a generic error when the response carries an error payload', () => {
    expect(() =>
      handleApiResponse({ response: makeResponse(500), error: { message: 'boom' } }),
    ).toThrow('Die Anfrage an den Server ist fehlgeschlagen.');
  });
});
