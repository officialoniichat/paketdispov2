/**
 * Current employee session, derived from the dev bearer token.
 *
 * The token is a standard JWT; we decode (not verify — the backend verifies the
 * RS256 signature) the payload to read `employee_no` and `name`. Falls back to
 * the pilot employee 'ma-101' when no token is present (offline-demo).
 */
import { devToken } from './api.js';

export interface Session {
  employeeNo: string;
  displayName: string;
}

const FALLBACK: Session = { employeeNo: 'ma-101', displayName: 'Mitarbeiter 101' };

/** Base64url-decode a JWT segment to a JSON object, or undefined on failure. */
function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const segment = token.split('.')[1];
  if (!segment) return undefined;
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The current employee derived from the dev token, or the pilot fallback. */
export function getSession(): Session {
  if (!devToken) return FALLBACK;
  const claims = decodeJwtPayload(devToken);
  if (!claims) return FALLBACK;
  const employeeNo = asString(claims.employee_no) ?? asString(claims.preferred_username);
  if (!employeeNo) return FALLBACK;
  const displayName = asString(claims.name) ?? employeeNo;
  return { employeeNo, displayName };
}
