import 'dotenv/config';

/** Centralised, validated-at-startup runtime configuration. */
function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.API_HOST ?? '0.0.0.0',
  port: num(process.env.API_PORT, 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: process.env.DATABASE_URL ?? '',
  otel: {
    disabled: bool(process.env.OTEL_SDK_DISABLED, true),
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'backend-api',
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
  },
  /**
   * OIDC / OAuth2 settings (§12.3, §16.1). In production a JWKS URI from Keycloak
   * or Microsoft Entra verifies RS256 bearer tokens. For local dev / CI a static
   * public key (AUTH_DEV_PUBLIC_KEY) lets the API run without an identity provider.
   */
  auth: {
    issuer: process.env.OIDC_ISSUER ?? '',
    audience: list(process.env.OIDC_AUDIENCE),
    jwksUri: process.env.OIDC_JWKS_URI ?? '',
    // Where roles live in the token. Keycloak: realm_access.roles. Entra: roles.
    roleClaimPaths: list(process.env.OIDC_ROLE_CLAIM_PATHS).length
      ? list(process.env.OIDC_ROLE_CLAIM_PATHS)
      : ['realm_access.roles', 'roles', 'groups'],
    employeeNoClaim: process.env.OIDC_EMPLOYEE_NO_CLAIM ?? 'employee_no',
    // Dev/CI only: PEM-encoded RS256 public key to verify locally-issued tokens.
    devPublicKeyPem: process.env.AUTH_DEV_PUBLIC_KEY ?? '',
  },
  swagger: {
    enabled: bool(process.env.SWAGGER_ENABLED, true),
    path: process.env.SWAGGER_PATH ?? 'docs',
  },
} as const;

export type AppConfig = typeof config;
