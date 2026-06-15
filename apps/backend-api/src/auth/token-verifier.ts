import { jwtVerify, type JWTVerifyGetKey, type KeyLike } from 'jose';
import { Role, normaliseRole, type Principal } from './rbac.js';

export type VerifyKey = KeyLike | Uint8Array | JWTVerifyGetKey;

export interface VerifierOptions {
  /** RS256 public key (dev) or a remote JWKS resolver (prod). */
  key?: VerifyKey;
  issuer?: string;
  audience?: string[];
  /** Dotted paths in the token where role/group strings live. */
  roleClaimPaths: string[];
  /** Claim holding the warehouse employee number (ownership key). */
  employeeNoClaim: string;
}

/** Read a possibly-nested claim by dotted path (e.g. "realm_access.roles"). */
function getByPath(claims: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, claims);
}

function collectRoles(claims: Record<string, unknown>, paths: string[]): Role[] {
  const found = new Set<Role>();
  for (const path of paths) {
    const value = getByPath(claims, path);
    const raw = Array.isArray(value) ? value : value != null ? [value] : [];
    for (const entry of raw) {
      if (typeof entry !== 'string') continue;
      const role = normaliseRole(entry);
      if (role) found.add(role);
    }
  }
  return [...found];
}

/**
 * Verifies OIDC bearer tokens (Keycloak / Microsoft Entra) and maps their
 * claims onto a canonical {@link Principal}. Verification is RS256 against a
 * JWKS in production, or a static public key in dev/CI (§16.1).
 */
export class OidcTokenVerifier {
  constructor(private readonly opts: VerifierOptions) {}

  get configured(): boolean {
    return this.opts.key != null;
  }

  async verify(token: string): Promise<Principal> {
    if (!this.opts.key) {
      throw new Error('OIDC verifier not configured: no JWKS URI or dev public key');
    }

    const { payload } = await jwtVerify(token, this.opts.key as JWTVerifyGetKey, {
      issuer: this.opts.issuer || undefined,
      audience: this.opts.audience?.length ? this.opts.audience : undefined,
    });

    const claims = payload as Record<string, unknown>;
    const employeeNo =
      this.readString(claims, this.opts.employeeNoClaim) ??
      this.readString(claims, 'preferred_username');

    return {
      sub: typeof claims.sub === 'string' ? claims.sub : '',
      employeeNo,
      displayName: this.readString(claims, 'name') ?? this.readString(claims, 'preferred_username'),
      roles: collectRoles(claims, this.opts.roleClaimPaths),
      claims,
    };
  }

  private readString(claims: Record<string, unknown>, key: string): string | undefined {
    const value = getByPath(claims, key);
    return typeof value === 'string' ? value : undefined;
  }
}
