import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createRemoteJWKSet, importSPKI } from 'jose';
import { config } from '../config.js';
import { logger } from '../observability/logger.js';
import { JwtAuthGuard, RolesGuard } from './guards.js';
import { OidcTokenVerifier, type VerifyKey } from './token-verifier.js';
import { TokenIssuer } from './token-issuer.js';
import { LoginService } from './login.service.js';
import { LoginController } from './login.controller.js';

async function buildVerifier(): Promise<OidcTokenVerifier> {
  let key: VerifyKey | undefined;
  if (config.auth.jwksUri) {
    key = createRemoteJWKSet(new URL(config.auth.jwksUri));
    logger.info({ jwksUri: config.auth.jwksUri }, 'OIDC verifier using remote JWKS');
  } else if (config.auth.devPublicKeyPem) {
    key = await importSPKI(config.auth.devPublicKeyPem, 'RS256');
    logger.warn('OIDC verifier using static dev public key (not for production)');
  } else {
    logger.warn('OIDC verifier unconfigured: all authenticated routes will reject');
  }

  return new OidcTokenVerifier({
    key,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
    roleClaimPaths: config.auth.roleClaimPaths,
    employeeNoClaim: config.auth.employeeNoClaim,
  });
}

/**
 * Cross-cutting authentication & RBAC (§16.1). Registers JwtAuthGuard (token
 * verification) and RolesGuard (role enforcement) as global guards, in that
 * order, so every route is fail-closed unless explicitly marked @Public.
 */
@Module({
  controllers: [LoginController],
  providers: [
    {
      provide: OidcTokenVerifier,
      useFactory: buildVerifier,
    },
    {
      provide: TokenIssuer,
      useFactory: () => new TokenIssuer({ devPrivateKeyPem: config.auth.devPrivateKeyPem, expiresIn: '12h' }),
    },
    LoginService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [OidcTokenVerifier],
})
export class AuthModule {}
