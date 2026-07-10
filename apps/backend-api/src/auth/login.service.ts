import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenIssuer } from './token-issuer.js';
import { verifyPin } from './pin.js';
import { normaliseRole, requiresPin, Role } from './rbac.js';

export interface LoginResult {
  token: string;
}

/**
 * Login against the local user table. Which credential is demanded depends on
 * the role:
 *
 * - **Mitarbeiter/in:** the Mitarbeiternummer alone — no PIN. See
 *   `requiresPin` in `rbac.ts` for why the customer ruled the PIN out here.
 * - **Teamlead / Admin / IT:** Mitarbeiternummer + PIN, checked against
 *   `pinHash`. A privileged user with no PIN set can never log in.
 *
 * Returns `null` for every kind of invalid credential (unknown employeeNo, wrong
 * or missing PIN, inactive employee) so the controller can answer with one
 * identical, generic 401. For the privileged roles that still means no user
 * enumeration; for the Mitarbeiterrolle the Mitarbeiternummer *is* the entire
 * credential, so a valid number is by design distinguishable from an invalid one.
 *
 * Constructor params use explicit `@Inject()` tokens (mirroring `guards.ts`'s
 * `JwtAuthGuard`) rather than relying on reflected design:paramtypes — the
 * vitest transform for this package does not emit decorator metadata, so
 * implicit type-based DI silently resolves to `undefined` under `test:int`.
 */
@Injectable()
export class LoginService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenIssuer) private readonly tokenIssuer: TokenIssuer,
  ) {}

  async login(employeeNo: string, pin?: string): Promise<LoginResult | null> {
    const user = await this.prisma.user.findUnique({
      where: { employeeNo },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.active) return null;

    const roles = user.roles
      .map((userRole: { role: { name: string } }) => normaliseRole(userRole.role.name))
      .filter((role: Role | undefined): role is Role => role !== undefined);
    const effectiveRoles = roles.length > 0 ? roles : [Role.Employee];

    if (requiresPin(effectiveRoles)) {
      const pinValid = pin !== undefined && (await verifyPin(pin, user.pinHash));
      if (!pinValid) return null;
    }

    const token = await this.tokenIssuer.issue({
      employeeNo: user.employeeNo,
      displayName: user.displayName,
      roles: effectiveRoles,
    });

    return { token };
  }
}
