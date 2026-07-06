import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenIssuer } from './token-issuer.js';
import { verifyPin } from './pin.js';
import { normaliseRole, Role } from './rbac.js';

export interface LoginResult {
  token: string;
}

/**
 * Real employee login (employeeNo + PIN, Task 4 of the PIN-login SDD plan) —
 * replaces the manual dev-token minting documented in the *.env.example files.
 * Returns `null` for every kind of invalid credential (unknown employeeNo,
 * wrong PIN, inactive employee, no PIN set) so the controller can answer with
 * one identical, generic 401 — never leaking which case applied (no user
 * enumeration).
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

  async login(employeeNo: string, pin: string): Promise<LoginResult | null> {
    const user = await this.prisma.user.findUnique({
      where: { employeeNo },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.active) return null;

    const pinValid = await verifyPin(pin, user.pinHash);
    if (!pinValid) return null;

    const roles = user.roles
      .map((userRole: { role: { name: string } }) => normaliseRole(userRole.role.name))
      .filter((role: Role | undefined): role is Role => role !== undefined);
    const effectiveRoles = roles.length > 0 ? roles : [Role.Employee];

    const token = await this.tokenIssuer.issue({
      employeeNo: user.employeeNo,
      displayName: user.displayName,
      roles: effectiveRoles,
    });

    return { token };
  }
}
