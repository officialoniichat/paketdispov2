import { SignJWT, importPKCS8 } from 'jose';
import type { Role } from './rbac.js';

export interface TokenIssuerOptions {
  /** RS256 private key PEM (dev), same env var read by `auth.module.ts`'s `buildVerifier`. */
  devPrivateKeyPem: string;
  /** JWT `exp` lifetime, e.g. "12h". */
  expiresIn: string;
}

export interface IssuePrincipal {
  employeeNo: string;
  displayName: string;
  roles: Role[];
}

/**
 * Mints RS256 JWTs for the first-party login (`POST /api/auth/login`). Mirror-image of
 * {@link OidcTokenVerifier}: the claim shape here (`employee_no`,
 * `realm_access.roles`, `name`) must match exactly what that verifier expects.
 */
export class TokenIssuer {
  constructor(private readonly options: TokenIssuerOptions) {}

  async issue(principal: IssuePrincipal): Promise<string> {
    const key = await importPKCS8(this.options.devPrivateKeyPem, 'RS256');
    return new SignJWT({
      employee_no: principal.employeeNo,
      realm_access: { roles: principal.roles },
      name: principal.displayName,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(`employee:${principal.employeeNo}`)
      .setIssuedAt()
      .setExpirationTime(this.options.expiresIn)
      .sign(key);
  }
}
