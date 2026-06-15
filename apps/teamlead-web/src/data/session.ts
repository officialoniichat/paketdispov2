/**
 * Dev session helpers: derive the logged-in teamlead id from the bearer token.
 *
 * In production the OIDC subject/employee_no comes from the access token issued
 * by Keycloak/Entra (§16.1). For local dev we decode the long-lived
 * `VITE_DEV_TOKEN` (RS256) without verifying the signature – verification is the
 * backend's job; here we only need the actor id for optimistic UI and audit.
 */

const DEV_FALLBACK_TEAMLEAD_ID = 'tl-001';

interface TokenClaims {
  sub?: string;
  employee_no?: string;
}

/** Base64url-decode the JWT payload segment; returns {} on any malformed input. */
function decodeJwtClaims(token: string | undefined): TokenClaims {
  if (!token) return {};
  const segments = token.split('.');
  if (segments.length < 2) return {};
  try {
    const payload = segments[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload);
    return JSON.parse(json) as TokenClaims;
  } catch {
    return {};
  }
}

/**
 * Logged-in teamlead id. Prefers the `employee_no` claim, then the `sub`
 * (stripping a `dev:` prefix), falling back to the dev default.
 */
export function resolveCurrentTeamleadId(token: string | undefined): string {
  const claims = decodeJwtClaims(token);
  if (claims.employee_no) return claims.employee_no;
  if (claims.sub) return claims.sub.replace(/^dev:/, '');
  return DEV_FALLBACK_TEAMLEAD_ID;
}
