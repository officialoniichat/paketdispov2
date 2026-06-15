import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Application roles (§5 / §16.1). Keycloak or Entra issue tokens whose role
 * claims are normalised onto these four canonical roles.
 *
 * - Employee  (Mitarbeiter/in): only own packages, own issues, own performance.
 *                               NEVER the full pool or foreign packages.
 * - Teamlead  (Teamlead Logistik): full pool, overrides, issue resolution.
 * - Admin     (Prozessverantwortliche): rules, master data, user management.
 * - It        (IT/Support): technical rights, no business overrides.
 */
export enum Role {
  Employee = 'employee',
  Teamlead = 'teamlead',
  Admin = 'admin',
  It = 'it',
}

/** Maps identity-provider role/group strings (DE + EN aliases) to canonical roles. */
const ROLE_ALIASES: Record<string, Role> = {
  employee: Role.Employee,
  mitarbeiter: Role.Employee,
  'mitarbeiter/in': Role.Employee,
  worker: Role.Employee,
  teamlead: Role.Teamlead,
  teamleiter: Role.Teamlead,
  'teamlead-logistik': Role.Teamlead,
  lead: Role.Teamlead,
  admin: Role.Admin,
  administrator: Role.Admin,
  'admin-prozess': Role.Admin,
  it: Role.It,
  'it-support': Role.It,
  support: Role.It,
  betrieb: Role.It,
};

/** Normalise a raw role/group string to a canonical Role, or undefined if unknown. */
export function normaliseRole(raw: string): Role | undefined {
  return ROLE_ALIASES[raw.trim().toLowerCase()];
}

/**
 * Authenticated principal attached to each request after JWT verification.
 * `roles` are canonical; `claims` keeps the raw token for the technical log only.
 */
export interface Principal {
  sub: string;
  employeeNo?: string;
  displayName?: string;
  roles: Role[];
  claims: Record<string, unknown>;
}

export function hasAnyRole(principal: Principal, roles: readonly Role[]): boolean {
  if (roles.length === 0) return true;
  return principal.roles.some((r) => roles.includes(r));
}

// --- Route metadata decorators ---------------------------------------------

export const ROLES_KEY = 'paket:roles';
export const IS_PUBLIC_KEY = 'paket:public';

/** Restrict a controller/handler to the given canonical roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Opt a handler out of authentication (health, docs). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Inject the verified Principal into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const request = ctx.switchToHttp().getRequest<{ principal?: Principal }>();
    if (!request.principal) {
      throw new Error('CurrentUser used on a route without JwtAuthGuard');
    }
    return request.principal;
  },
);

/** Request shape once the guard has authenticated it. */
export interface AuthenticatedRequest {
  principal?: Principal;
  headers: Record<string, string | string[] | undefined>;
}
