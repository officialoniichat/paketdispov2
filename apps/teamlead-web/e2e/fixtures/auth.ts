/**
 * Login constants + helpers for the teamlead-web e2e suite.
 *
 * The cockpit itself has NO login screen (a deliberate pre-pilot decision — it
 * reads a static bearer token from `/env.js`). The harness therefore mints a
 * real token the way any client would: `POST /api/auth/login` against the
 * backend booted in `./backend-server.ts`. That keeps the ephemeral RSA signing
 * key inside the backend process — no fixture key is committed anywhere.
 *
 * Values mirror `apps/backend-api/src/dev/scenarios/seed-data.ts` (`USERS`,
 * `PRIVILEGED_DEMO_PIN`).
 */
import { BACKEND_URL } from './ports.js';

/** Seeded Teamlead. Privileged roles sign in with Nummer + PIN. */
export const TEAMLEAD_NO = 'tl-001';
/** `PRIVILEGED_DEMO_PIN` — Teamlead/Admin/IT only. */
export const DEMO_PIN = '0000';
/** A PIN no seeded user has — proves the Teamlead path still rejects a bad PIN. */
export const WRONG_PIN = '9999';
/** No seeded user carries this Mitarbeiternummer (`USERS` runs ma-101..110, ma-201/202). */
export const UNKNOWN_EMPLOYEE_NO = 'ma-999';

/** Seeded Mitarbeiter/innen who are auto-planned (skillTier ≠ starter/dummy). */
export const PLANNABLE_EMPLOYEE_NOS = [
  'ma-101',
  'ma-102',
  'ma-103',
  'ma-104',
  'ma-105',
  'ma-106',
  'ma-107',
  'ma-108',
  'ma-109',
  'ma-110',
] as const;

/** The claims `TokenIssuer` puts on every token it mints. */
export interface TokenClaims {
  sub?: string;
  employee_no?: string;
  realm_access?: { roles?: string[] };
}

/** Base64url-decode a JWT payload. Signature verification is the backend's job. */
export function decodeJwtClaims(token: string): TokenClaims {
  const segment = token.split('.')[1];
  if (!segment) throw new Error(`Not a JWT: ${token.slice(0, 24)}…`);
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as TokenClaims;
}

/** Roles carried by a token, from the `realm_access.roles` claim. */
export function rolesOf(token: string): string[] {
  return decodeJwtClaims(token).realm_access?.roles ?? [];
}

/** Raw login call — returns the HTTP status alongside the body so 401s stay assertable. */
export async function postLogin(body: {
  employeeNo: string;
  pin?: string;
}): Promise<{ status: number; token?: string; message?: string }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  return { status: res.status, ...payload };
}

/** Login that insists on success; returns the bearer token. */
export async function login(employeeNo: string, pin?: string): Promise<string> {
  const result = await postLogin(pin === undefined ? { employeeNo } : { employeeNo, pin });
  if (result.status !== 200 || !result.token) {
    throw new Error(`Login for ${employeeNo} failed: HTTP ${result.status} ${result.message ?? ''}`);
  }
  return result.token;
}

/** Bearer header for an authenticated API call. */
export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}
