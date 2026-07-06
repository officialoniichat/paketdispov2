import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OidcTokenVerifier } from './token-verifier.js';
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  Role,
  hasAnyRole,
  type AuthenticatedRequest,
  type Principal,
} from './rbac.js';

/** Routes whose transport (browser `EventSource`) cannot set a custom
 *  `Authorization` header, so a `?token=` query param is accepted as a
 *  fallback (see {@link bearerToken}). Keep this list narrow — do not widen
 *  query-param auth to routes that can use a normal header. */
const SSE_QUERY_TOKEN_ROUTES = ['/api/me/stream', '/api/teamlead/stream'];

function isSseQueryTokenRoute(req: AuthenticatedRequest): boolean {
  const path = req.url?.split('?')[0];
  return path !== undefined && SSE_QUERY_TOKEN_ROUTES.includes(path);
}

function hasAuthorizationHeader(req: AuthenticatedRequest): boolean {
  const header = req.headers['authorization'] ?? req.headers['Authorization'];
  return Array.isArray(header) ? header.length > 0 : Boolean(header);
}

function headerBearerToken(req: AuthenticatedRequest): string | undefined {
  const header = req.headers['authorization'] ?? req.headers['Authorization'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  const [scheme, token] = value.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

function queryBearerToken(req: AuthenticatedRequest): string | undefined {
  const value = req.query?.['token'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Resolves the bearer token for a request. The `Authorization` header always
 * takes priority: if it is present at all (even malformed), it is used
 * exclusively and a query-param token is never consulted, so a query token
 * can never silently override or backstop a bad header. Only when no
 * `Authorization` header is present at all do SSE routes (which cannot use
 * `EventSource` custom headers) fall back to a `?token=` query param.
 */
function bearerToken(req: AuthenticatedRequest): string | undefined {
  if (hasAuthorizationHeader(req)) {
    return headerBearerToken(req);
  }
  if (isSseQueryTokenRoute(req)) {
    return queryBearerToken(req);
  }
  return undefined;
}

/**
 * Authenticates every request by verifying the OIDC bearer token and attaching
 * the resolved {@link Principal}. Handlers marked {@link Public} are exempt.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(OidcTokenVerifier) private readonly verifier: OidcTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let principal: Principal;
    try {
      principal = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    req.principal = principal;
    return true;
  }
}

/**
 * Enforces {@link Roles} metadata. Runs after {@link JwtAuthGuard}, so the
 * principal is already attached. A route with no @Roles only requires auth.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = req.principal;
    if (!principal) {
      throw new UnauthorizedException('Not authenticated');
    }
    if (!hasAnyRole(principal, required)) {
      throw new ForbiddenException('Insufficient role for this resource');
    }
    return true;
  }
}
