/**
 * Real employee login against `POST /api/auth/login` (see backend Task 4).
 *
 * The backend returns a signed bearer JWT; we decode (not verify — the backend
 * verifies the RS256 signature on every request) its `employee_no`/`name`/`exp`
 * claims so the app can render the signed-in identity without a second round
 * trip. The token itself is persisted via `data/session.ts` and only ever sent
 * as an Authorization header — never logged.
 */
import { decodeJwt } from 'jose';
import { apiBaseUrl } from './api.js';
import { setSession, clearSession, type Session } from './session.js';

export class LoginError extends Error {}

interface LoginResponseBody {
  token: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function login(employeeNo: string, pin: string): Promise<Session> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeNo, pin }),
  });
  if (!response.ok) {
    throw new LoginError('Ungültige Anmeldedaten');
  }
  const { token } = (await response.json()) as LoginResponseBody;
  const claims = decodeJwt(token);
  const decodedEmployeeNo = asString(claims.employee_no) ?? employeeNo;
  const displayName = asString(claims.name) ?? decodedEmployeeNo;
  const exp = typeof claims.exp === 'number' ? claims.exp : Math.floor(Date.now() / 1000);
  const session: Session = { token, employeeNo: decodedEmployeeNo, displayName, exp };
  setSession(session);
  return session;
}

export function logout(): void {
  clearSession();
}
