import { describe, expect, it } from 'vitest';
import { generateKeyPair, exportPKCS8 } from 'jose';
import { TokenIssuer } from './token-issuer.js';
import { OidcTokenVerifier } from './token-verifier.js';
import { Role } from './rbac.js';

describe('TokenIssuer', () => {
  it('mints a token that OidcTokenVerifier accepts and maps to the right Principal', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const privatePem = await exportPKCS8(privateKey);
    const issuer = new TokenIssuer({ devPrivateKeyPem: privatePem, expiresIn: '12h' });

    const token = await issuer.issue({
      employeeNo: 'ma-101',
      displayName: 'Mitarbeiter 101',
      roles: [Role.Employee],
    });

    const verifier = new OidcTokenVerifier({
      key: publicKey,
      roleClaimPaths: ['realm_access.roles'],
      employeeNoClaim: 'employee_no',
    });
    const principal = await verifier.verify(token);

    expect(principal.employeeNo).toBe('ma-101');
    expect(principal.displayName).toBe('Mitarbeiter 101');
    expect(principal.roles).toEqual([Role.Employee]);
  });
});
