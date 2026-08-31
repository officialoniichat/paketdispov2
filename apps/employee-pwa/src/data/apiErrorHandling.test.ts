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

  it('reicht die deutsche Meldung des Backends durch (409/400 sind fertige Sätze)', () => {
    expect(() =>
      handleApiResponse({
        response: makeResponse(409),
        error: { message: 'Der Beleg ist nicht in Bearbeitung.' },
      }),
    ).toThrow('Der Beleg ist nicht in Bearbeitung.');
  });

  it('verbindet die Liste einer Validierungsantwort zu einer Zeile', () => {
    expect(() =>
      handleApiResponse({
        response: makeResponse(400),
        error: { message: ['employeeNos darf nicht leer sein', 'reason fehlt'] },
      }),
    ).toThrow('employeeNos darf nicht leer sein · reason fehlt');
  });

  it('throws a generic error when the error payload carries no readable message', () => {
    expect(() => handleApiResponse({ response: makeResponse(500), error: {} })).toThrow(
      'Die Anfrage an den Server ist fehlgeschlagen.',
    );
  });
});
