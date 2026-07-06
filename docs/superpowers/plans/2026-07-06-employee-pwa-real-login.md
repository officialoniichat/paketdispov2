# Employee PWA — Real Login + Offline Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/employee-pwa`'s env-token identity + Dexie offline scaffold with a real employee-number+PIN login against `apps/backend-api`, and make every screen read/write the live backend directly.

**Architecture:** New `POST /api/auth/login` in backend-api mints a real JWT (same claim shape the existing `OidcTokenVerifier` already expects) after checking a new hashed `pinHash` on `User`. The PWA gets a `LoginScreen` that calls it, stores the token in `localStorage`, and removes `TischLoginScreen`/workstation-claim entirely (Tisch is admin-assigned via `User.workstationId`, read-only on the client). Every Dexie-backed read/write in the PWA is replaced by a direct `@paket/api-client` call (React Query), keeping the same screen components but swapping their data layer.

**Tech Stack:** NestJS (Fastify), Prisma/PostgreSQL, `jose` (already a dep), `bcrypt` (new dep), React + Vite PWA, `@tanstack/react-query`, `@paket/api-client` (openapi-fetch), Playwright.

## Global Constraints

- No backwards-compat shims: delete replaced code outright (`db/`, `demo/`, `domain/exampleAssignment.ts`, `TischLoginScreen.tsx`, `DemoControls.tsx`) in the same change set that replaces them — do not leave them dead in the tree "just in case".
- `pnpm typecheck` must stay green (13/13) after every task that touches type-checked packages.
- Conventional Commits: `feat(auth): ...`, `feat(employee-pwa): ...`, `refactor(employee-pwa): ...`, `test(e2e): ...`, `docs(architecture): ...`.
- Any change to Prisma schema, OpenAPI surface, or the type-generation chain (`domain-types` ↔ Prisma ↔ OpenAPI ↔ `api-client`) must be regenerated in the same commit, not left stale.
- Any change to `apps/employee-pwa`'s components/screens or auth flow must update `docs/architecture/src/c3-employee-pwa-components.mmd` and re-render via `docs/architecture/render.sh` in the same change set.
- PIN is never logged, never returned in any API response, never stored in plaintext.

---

### Task 1: `pinHash` column + Prisma migration

**Files:**
- Modify: `apps/backend-api/prisma/schema.prisma` (the `User` model, currently lines 195–220 per the design spec)
- Create: new migration under `apps/backend-api/prisma/migrations/`

**Interfaces:**
- Produces: `User.pinHash: string | null` field, available to Prisma Client as `prisma.user.update({ where: { employeeNo }, data: { pinHash } })` and `prisma.user.findUnique({ where: { employeeNo } })` returning `pinHash`.

- [ ] **Step 1: Add the field**

In `apps/backend-api/prisma/schema.prisma`, inside `model User { ... }`, add a line directly after `skillTier`:

```prisma
  skillTier            SkillTier @default(profi)
  workstationId        String?
  pinHash              String?
```

- [ ] **Step 2: Generate the migration**

Run: `cd apps/backend-api && pnpm prisma migrate dev --name add_user_pin_hash`
Expected: a new `apps/backend-api/prisma/migrations/<timestamp>_add_user_pin_hash/migration.sql` containing `ALTER TABLE "users" ADD COLUMN "pinHash" TEXT;`, and Prisma Client regenerated.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter backend-api typecheck` (or `pnpm typecheck` at repo root)
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend-api/prisma/schema.prisma apps/backend-api/prisma/migrations
git commit -m "feat(auth): add pinHash column to User"
```

---

### Task 2: `bcrypt` dependency + PIN hashing utility

**Files:**
- Modify: `apps/backend-api/package.json`
- Create: `apps/backend-api/src/auth/pin.ts`
- Test: `apps/backend-api/src/auth/pin.test.ts`

**Interfaces:**
- Produces: `hashPin(pin: string): Promise<string>`, `verifyPin(pin: string, hash: string): Promise<boolean>` — consumed by Task 3 (login) and Task 5 (admin pin reset).

- [ ] **Step 1: Add the dependency**

Run: `cd apps/backend-api && pnpm add bcrypt && pnpm add -D @types/bcrypt`
Expected: `bcrypt` and `@types/bcrypt` appear in `apps/backend-api/package.json`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/backend-api/src/auth/pin.test.ts
import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from './pin.js';

describe('pin hashing', () => {
  it('verifies a correct PIN against its hash', async () => {
    const hash = await hashPin('4711');
    await expect(verifyPin('4711', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const hash = await hashPin('4711');
    await expect(verifyPin('0000', hash)).resolves.toBe(false);
  });

  it('rejects verification against a null hash', async () => {
    await expect(verifyPin('4711', null)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `pnpm --filter backend-api exec vitest run src/auth/pin.test.ts`
Expected: FAIL — `pin.js` does not exist.

- [ ] **Step 3: Implement**

```ts
// apps/backend-api/src/auth/pin.ts
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend-api exec vitest run src/auth/pin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend-api/package.json apps/backend-api/pnpm-lock.yaml apps/backend-api/src/auth/pin.ts apps/backend-api/src/auth/pin.test.ts
git commit -m "feat(auth): add bcrypt-based PIN hashing utility"
```

---

### Task 3: JWT minting helper (reuse `AUTH_DEV_PRIVATE_KEY`)

**Files:**
- Create: `apps/backend-api/src/auth/token-issuer.ts`
- Test: `apps/backend-api/src/auth/token-issuer.test.ts`

**Interfaces:**
- Consumes: `config.auth.devPrivateKeyPem` (same env var `AUTH_DEV_PRIVATE_KEY` already read by `auth.module.ts`'s `buildVerifier`), `Role` from `./rbac.js`.
- Produces: `TokenIssuer.issue(principal: { employeeNo: string; displayName: string; roles: Role[] }): Promise<string>` — consumed by Task 4 (login endpoint).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend-api/src/auth/token-issuer.test.ts
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
      roles: [Role.employee],
    });

    const verifier = new OidcTokenVerifier({ key: publicKey, roleClaimPaths: ['realm_access.roles'], employeeNoClaim: 'employee_no' });
    const principal = await verifier.verify(token);

    expect(principal.employeeNo).toBe('ma-101');
    expect(principal.displayName).toBe('Mitarbeiter 101');
    expect(principal.roles).toEqual([Role.employee]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend-api exec vitest run src/auth/token-issuer.test.ts`
Expected: FAIL — `token-issuer.js` does not exist.

- [ ] **Step 3: Implement**

```ts
// apps/backend-api/src/auth/token-issuer.ts
import { SignJWT, importPKCS8 } from 'jose';
import type { Role } from './rbac.js';

export interface TokenIssuerOptions {
  devPrivateKeyPem: string;
  expiresIn: string;
}

export interface IssuePrincipal {
  employeeNo: string;
  displayName: string;
  roles: Role[];
}

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend-api exec vitest run src/auth/token-issuer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-api/src/auth/token-issuer.ts apps/backend-api/src/auth/token-issuer.test.ts
git commit -m "feat(auth): add JWT token issuer for real login"
```

---

### Task 4: `POST /api/auth/login` endpoint

**Files:**
- Create: `apps/backend-api/src/auth/login.dto.ts`
- Create: `apps/backend-api/src/auth/login.controller.ts`
- Create: `apps/backend-api/src/auth/login.service.ts`
- Modify: `apps/backend-api/src/auth/auth.module.ts` (register `LoginController`, `LoginService`, `TokenIssuer` provider)
- Test: `apps/backend-api/src/auth/login.service.test.ts`
- Test (integration): `apps/backend-api/src/integration/auth-login.int.test.ts`

**Interfaces:**
- Consumes: `PrismaService` (existing, injected the same way `employees.service.ts` does), `hashPin`/`verifyPin` from Task 2, `TokenIssuer` from Task 3, `Public()` decorator from `./rbac.js`.
- Produces: `LoginService.login(employeeNo: string, pin: string): Promise<{ token: string } | null>` (null = invalid credentials) — consumed by `LoginController`. HTTP contract: `POST /api/auth/login` body `{ employeeNo: string, pin: string }` → `200 { token: string }` or `401 { message: 'Ungültige Anmeldedaten' }`.

- [ ] **Step 1: DTOs**

```ts
// apps/backend-api/src/auth/login.dto.ts
import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginRequestDto {
  @ApiProperty()
  @IsString()
  employeeNo!: string;

  @ApiProperty()
  @IsString()
  @Length(4, 8)
  pin!: string;
}

export class LoginResponseDto {
  @ApiProperty()
  token!: string;
}
```

- [ ] **Step 2: Write the failing service test**

```ts
// apps/backend-api/src/auth/login.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { LoginService } from './login.service.js';
import { TokenIssuer } from './token-issuer.js';
import { hashPin } from './pin.js';
import { Role } from './rbac.js';

function buildPrismaStub(user: { employeeNo: string; displayName: string; pinHash: string | null; active: boolean; roles: { role: { name: string } }[] } | null) {
  return { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
}

describe('LoginService', () => {
  it('returns a token for a correct employeeNo/PIN pair', async () => {
    const pinHash = await hashPin('4711');
    const prisma = buildPrismaStub({ employeeNo: 'ma-101', displayName: 'Mitarbeiter 101', pinHash, active: true, roles: [{ role: { name: 'employee' } }] });
    const issuer = { issue: vi.fn().mockResolvedValue('signed.jwt.token') } as unknown as TokenIssuer;
    const service = new LoginService(prisma, issuer);

    const result = await service.login('ma-101', '4711');

    expect(result).toEqual({ token: 'signed.jwt.token' });
    expect(issuer.issue).toHaveBeenCalledWith({ employeeNo: 'ma-101', displayName: 'Mitarbeiter 101', roles: [Role.employee] });
  });

  it('returns null for a wrong PIN', async () => {
    const pinHash = await hashPin('4711');
    const prisma = buildPrismaStub({ employeeNo: 'ma-101', displayName: 'Mitarbeiter 101', pinHash, active: true, roles: [{ role: { name: 'employee' } }] });
    const service = new LoginService(prisma, { issue: vi.fn() } as unknown as TokenIssuer);

    expect(await service.login('ma-101', '0000')).toBeNull();
  });

  it('returns null for an unknown employeeNo', async () => {
    const prisma = buildPrismaStub(null);
    const service = new LoginService(prisma, { issue: vi.fn() } as unknown as TokenIssuer);

    expect(await service.login('ma-999', '4711')).toBeNull();
  });

  it('returns null for an inactive employee', async () => {
    const pinHash = await hashPin('4711');
    const prisma = buildPrismaStub({ employeeNo: 'ma-101', displayName: 'Mitarbeiter 101', pinHash, active: false, roles: [{ role: { name: 'employee' } }] });
    const service = new LoginService(prisma, { issue: vi.fn() } as unknown as TokenIssuer);

    expect(await service.login('ma-101', '4711')).toBeNull();
  });

  it('returns null when no PIN has been set for the employee', async () => {
    const prisma = buildPrismaStub({ employeeNo: 'ma-101', displayName: 'Mitarbeiter 101', pinHash: null, active: true, roles: [{ role: { name: 'employee' } }] });
    const service = new LoginService(prisma, { issue: vi.fn() } as unknown as TokenIssuer);

    expect(await service.login('ma-101', '4711')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter backend-api exec vitest run src/auth/login.service.test.ts`
Expected: FAIL — `login.service.js` does not exist.

- [ ] **Step 4: Implement the service**

```ts
// apps/backend-api/src/auth/login.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenIssuer } from './token-issuer.js';
import { verifyPin } from './pin.js';
import { normaliseRole, Role } from './rbac.js';

export interface LoginResult {
  token: string;
}

@Injectable()
export class LoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenIssuer: TokenIssuer,
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
      .map((userRole) => normaliseRole(userRole.role.name))
      .filter((role): role is Role => role !== undefined);
    const effectiveRoles = roles.length > 0 ? roles : [Role.employee];

    const token = await this.tokenIssuer.issue({
      employeeNo: user.employeeNo,
      displayName: user.displayName,
      roles: effectiveRoles,
    });

    return { token };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter backend-api exec vitest run src/auth/login.service.test.ts`
Expected: PASS (5 tests). If `normaliseRole`'s actual signature differs from `(name: string) => Role | undefined`, read `apps/backend-api/src/auth/rbac.ts` and adjust the mapping to match its real signature before proceeding — do not guess.

- [ ] **Step 6: Controller**

```ts
// apps/backend-api/src/auth/login.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Public } from './rbac.js';
import { LoginService } from './login.service.js';
import { LoginRequestDto, LoginResponseDto } from './login.dto.js';

@ApiTags('auth')
@Controller('api/auth')
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Ungültige Anmeldedaten' })
  async login(@Body() body: LoginRequestDto): Promise<LoginResponseDto> {
    const result = await this.loginService.login(body.employeeNo, body.pin);
    if (!result) {
      throw new UnauthorizedException('Ungültige Anmeldedaten');
    }
    return result;
  }
}
```

- [ ] **Step 7: Wire into `auth.module.ts`**

Read the current `apps/backend-api/src/auth/auth.module.ts` in full first (it registers `OidcTokenVerifier` via `useFactory: buildVerifier` and the two `APP_GUARD` providers). Add `LoginController` to `controllers`, add `LoginService` to `providers`, and add a `TokenIssuer` provider that reads `AUTH_DEV_PRIVATE_KEY` from the same config path `buildVerifier` uses for `devPublicKeyPem` (find the sibling private-key config field — if it doesn't exist yet, add `config.auth.devPrivateKeyPem` reading `process.env.AUTH_DEV_PRIVATE_KEY` next to wherever `devPublicKeyPem` is read):

```ts
{
  provide: TokenIssuer,
  useFactory: (config: ConfigType) =>
    new TokenIssuer({ devPrivateKeyPem: config.auth.devPrivateKeyPem, expiresIn: '12h' }),
  inject: [CONFIG_TOKEN], // match whatever token/import buildVerifier already uses for config
},
```

Match the exact `ConfigType`/injection token names already used in that file — do not invent new ones.

- [ ] **Step 8: Integration test**

```ts
// apps/backend-api/src/integration/auth-login.int.test.ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { hashPin } from '../auth/pin.js';
// Follow the exact bootstrap pattern used by an existing *.int.test.ts in this
// directory (e.g. assign-bundle.int.test.ts) for spinning up the Nest app +
// Testcontainers Postgres + Prisma seeding — reuse that harness, do not build a new one.

describe('POST /api/auth/login', () => {
  // beforeAll: boot app, seed one User with employeeNo 'ma-101', active: true,
  // pinHash: await hashPin('4711'), one UserRole -> Role 'employee'.

  it('returns 200 + a token for correct credentials', async () => {
    // POST /api/auth/login { employeeNo: 'ma-101', pin: '4711' }
    // expect status 200, body.token is a non-empty string
  });

  it('returns 401 for a wrong PIN', async () => {
    // POST /api/auth/login { employeeNo: 'ma-101', pin: '0000' }
    // expect status 401
  });

  it('the returned token authorizes a call to GET /api/me/today', async () => {
    // POST /api/auth/login, then GET /api/me/today with Authorization: Bearer <token>
    // expect status 200 (not 401/403)
  });
});
```

Fill in the bootstrap using the exact helper functions already exported by the neighboring `*.int.test.ts` file (e.g. `assign-bundle.int.test.ts`) — read that file first, copy its app-bootstrap and Prisma-seed pattern verbatim, and adapt only the seeded entities.

- [ ] **Step 9: Run integration test**

Run: `pnpm --filter backend-api test:int -- auth-login.int.test.ts` (match the actual script name in `apps/backend-api/package.json` — check it first)
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add apps/backend-api/src/auth
git commit -m "feat(auth): add POST /api/auth/login endpoint"
```

---

### Task 5: Admin PIN reset endpoint

**Files:**
- Modify: `apps/backend-api/src/employees/employees.controller.ts` (add `PATCH /:id/pin`)
- Modify: `apps/backend-api/src/employees/employees.service.ts` (add `resetPin`)
- Modify: `apps/backend-api/src/employees/employees.dto.ts` (add `PinResetDto`)
- Test: `apps/backend-api/src/employees/employees.service.test.ts` (extend existing, or create if none exists)

**Interfaces:**
- Consumes: `hashPin` from Task 2, existing `EventLogService` (already used by `updateProfile` for audit events).
- Produces: `EmployeesService.resetPin(employeeNo: string, pin: string): Promise<void>` — HTTP contract `PATCH /api/admin/employees/:id/pin` body `{ pin: string }`, `@Roles(Role.Admin, Role.Teamlead)` (same as the rest of `EmployeesController`), emits an `employee.pin_reset` event (no PIN value in the event payload).

- [ ] **Step 1: DTO**

```ts
// add to apps/backend-api/src/employees/employees.dto.ts
export class PinResetDto {
  @ApiProperty()
  @IsString()
  @Length(4, 8)
  pin!: string;
}
```
(Match the exact `@ApiProperty`/`@IsString`/`@Length` import style already used in that file.)

- [ ] **Step 2: Write the failing test**

```ts
// apps/backend-api/src/employees/employees.service.test.ts (add this case;
// read the existing file first to match its exact test-setup/mock pattern
// for PrismaService and EventLogService)
it('resetPin hashes the PIN and stores it, without emitting the plaintext PIN', async () => {
  const prisma = /* existing mock builder from this file */;
  const eventLog = /* existing mock builder from this file */;
  const service = new EmployeesService(prisma, eventLog /* + whatever else the constructor already takes */);

  await service.resetPin('ma-101', '4711');

  expect(prisma.user.update).toHaveBeenCalledWith({
    where: { employeeNo: 'ma-101' },
    data: { pinHash: expect.any(String) },
  });
  const [[updateArgs]] = prisma.user.update.mock.calls;
  expect(updateArgs.data.pinHash).not.toBe('4711');
  expect(eventLog.append).toHaveBeenCalledWith(expect.objectContaining({ type: 'employee.pin_reset' }));
  const [[eventArgs]] = eventLog.append.mock.calls;
  expect(JSON.stringify(eventArgs)).not.toContain('4711');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter backend-api exec vitest run src/employees/employees.service.test.ts`
Expected: FAIL — `resetPin` does not exist.

- [ ] **Step 4: Implement**

Read `apps/backend-api/src/employees/employees.service.ts` in full first to match its exact `EventLogService.append` call shape (the same one `updateProfile` uses for `employee.profile_updated`). Then add:

```ts
async resetPin(employeeNo: string, pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  await this.prisma.user.update({ where: { employeeNo }, data: { pinHash } });
  await this.eventLog.append({
    type: 'employee.pin_reset',
    employeeNo,
    // match whatever other required fields employee.profile_updated events carry
    // (actor, timestamp, etc.) — copy that shape exactly, omit the PIN itself.
  });
}
```

Import `hashPin` from `../auth/pin.js`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter backend-api exec vitest run src/employees/employees.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Controller route**

Add to `employees.controller.ts` (matching its existing `@Roles`/`@Controller('api/admin/employees')` decorators and the `:id` param pattern already used by `PATCH /:id`):

```ts
@Patch(':id/pin')
async resetPin(@Param('id') id: string, @Body() body: PinResetDto): Promise<void> {
  await this.employeesService.resetPin(id, body.pin);
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend-api/src/employees
git commit -m "feat(auth): add admin PIN reset endpoint"
```

---

### Task 6: OpenAPI regen + `api-client`/`domain-types` update

**Files:**
- Modify: whatever OpenAPI spec generation the repo uses (check `apps/backend-api/src/openapi/` for the existing generation entrypoint before running)
- Modify: `packages/api-client/src/generated/schema.ts` (regenerated, not hand-edited)
- Modify: `packages/domain-types` — add Zod schemas only if other request/response DTOs in that package are validated client-side the same way (check for an existing `me.schema.ts` or similar pattern first)

- [ ] **Step 1: Regenerate the OpenAPI spec + client**

Find and run the exact existing command (check `apps/backend-api/package.json` / `packages/api-client/package.json` scripts — likely something like `pnpm --filter backend-api openapi:generate && pnpm --filter api-client generate`; use the DB-less recipe noted in memory `cross-worktree-symlink-build-fix` if the backend needs a running DB for this step).

- [ ] **Step 2: Verify the new endpoints appear**

Run: `grep -n "auth/login\|admin/employees/{id}/pin" packages/api-client/src/generated/schema.ts`
Expected: both paths present.

- [ ] **Step 3: Add Zod schemas to `domain-types` if applicable**

Only if the codebase pattern requires it (check first) — add `LoginRequestSchema`/`LoginResponseSchema` mirroring the DTOs from Task 4.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: 13/13 green (unchanged count, or +1 if a new package's tsconfig gets picked up — verify against the current baseline).

- [ ] **Step 5: Commit**

```bash
git add apps/backend-api/openapi.json packages/api-client/src/generated packages/domain-types
git commit -m "feat(auth): regenerate OpenAPI + api-client for login/pin-reset endpoints"
```

---

### Task 7: Frontend `session.ts` + `api.ts` rewrite

**Files:**
- Modify: `apps/employee-pwa/src/data/session.ts` (full rewrite)
- Modify: `apps/employee-pwa/src/data/api.ts` (remove offline branches)
- Create: `apps/employee-pwa/src/data/auth.ts` (login call + logout)
- Test: `apps/employee-pwa/src/data/session.test.ts`

**Interfaces:**
- Produces: `getSession(): Session | null`, `setSession(session: Session): void`, `clearSession(): void`, `isSessionExpired(session: Session): boolean`, where `Session = { token: string; employeeNo: string; displayName: string; exp: number }`. `login(employeeNo: string, pin: string): Promise<Session>` (throws on 401). These are consumed by Task 8 (`App.tsx`), Task 9 (`LoginScreen`), and every screen that currently imports `getSession`/`isBackendEnabled`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/employee-pwa/src/data/session.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getSession, setSession, clearSession, isSessionExpired } from './session.js';

describe('session', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no session is stored', () => {
    expect(getSession()).toBeNull();
  });

  it('round-trips a session through localStorage', () => {
    const session = { token: 'abc.def.ghi', employeeNo: 'ma-101', displayName: 'Mitarbeiter 101', exp: Date.now() / 1000 + 3600 };
    setSession(session);
    expect(getSession()).toEqual(session);
  });

  it('clearSession removes the stored session', () => {
    setSession({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: 9999999999 });
    clearSession();
    expect(getSession()).toBeNull();
  });

  it('isSessionExpired is true for a past exp', () => {
    expect(isSessionExpired({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: 0 })).toBe(true);
  });

  it('isSessionExpired is false for a future exp', () => {
    expect(isSessionExpired({ token: 't', employeeNo: 'ma-101', displayName: 'x', exp: Date.now() / 1000 + 3600 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter employee-pwa exec vitest run src/data/session.test.ts`
Expected: FAIL — current `session.ts` has no `setSession`/`clearSession`/`isSessionExpired`.

- [ ] **Step 3: Implement `session.ts`**

```ts
// apps/employee-pwa/src/data/session.ts
const STORAGE_KEY = 'paket.session';

export interface Session {
  token: string;
  employeeNo: string;
  displayName: string;
  exp: number;
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSessionExpired(session: Session): boolean {
  return session.exp * 1000 <= Date.now();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter employee-pwa exec vitest run src/data/session.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement `auth.ts`**

```ts
// apps/employee-pwa/src/data/auth.ts
import { decodeJwt } from 'jose'; // already a transitive dep via api-client/backend patterns; if not present in employee-pwa, add `jose` as a direct dependency
import { apiBaseUrl } from './api.js';
import { setSession, clearSession, type Session } from './session.js';

export class LoginError extends Error {}

export async function login(employeeNo: string, pin: string): Promise<Session> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeNo, pin }),
  });
  if (!response.ok) {
    throw new LoginError('Ungültige Anmeldedaten');
  }
  const { token } = (await response.json()) as { token: string };
  const claims = decodeJwt(token);
  const session: Session = {
    token,
    employeeNo: String(claims.employee_no),
    displayName: String(claims.name),
    exp: Number(claims.exp),
  };
  setSession(session);
  return session;
}

export function logout(): void {
  clearSession();
}
```

- [ ] **Step 6: Rewrite `api.ts`**

Read the current full `apps/employee-pwa/src/data/api.ts` (44 lines) and replace the `isBackendEnabled`/`devToken`/`demoControlsEnabled` exports and the `createApiClient` call's token source:

```ts
// apps/employee-pwa/src/data/api.ts
import { createApiClient } from '@paket/api-client';
import { getSession } from './session.js';

function resolveEnv(name: string): string | undefined {
  return import.meta.env[name] as string | undefined;
}

export const apiBaseUrl: string = (resolveEnv('VITE_API_BASE_URL') ?? '').replace(/\/+$/, '');

let cachedClient: ReturnType<typeof createApiClient> | undefined;

export function getApiClient() {
  if (!cachedClient) {
    cachedClient = createApiClient({
      baseUrl: apiBaseUrl,
      token: () => getSession()?.token ?? '',
    });
  }
  return cachedClient;
}
```

If `createApiClient`'s `token` option is a static string rather than a getter function in the actual `@paket/api-client` implementation, read `packages/api-client/src/index.ts` first and adapt — do not assume; the important behavioral requirement is that every request picks up the *current* session token, not one captured at client-construction time.

- [ ] **Step 7: Run full data-layer typecheck**

Run: `pnpm --filter employee-pwa typecheck`
Expected: errors in every file that still imports `isBackendEnabled`/`devToken`/`demoControlsEnabled` — this is expected at this point in the plan; they get fixed in Tasks 8–11. Note the error list for reference, do not attempt to fix them all in this task.

- [ ] **Step 8: Commit**

```bash
git add apps/employee-pwa/src/data/session.ts apps/employee-pwa/src/data/session.test.ts apps/employee-pwa/src/data/auth.ts apps/employee-pwa/src/data/api.ts
git commit -m "feat(employee-pwa): real session + login API call, remove offline flags from api.ts"
```

---

### Task 8: `LoginScreen` + `App.tsx` gate rewrite

**Files:**
- Create: `apps/employee-pwa/src/screens/LoginScreen.tsx`
- Modify: `apps/employee-pwa/src/App.tsx` (full rewrite of the gating logic)
- Delete: `apps/employee-pwa/src/screens/TischLoginScreen.tsx`
- Delete: `apps/employee-pwa/src/data/workstation.ts`

**Interfaces:**
- Consumes: `login`/`logout` from Task 7's `auth.ts`, `getSession`/`isSessionExpired` from `session.ts`.
- Produces: `App` renders `<LoginScreen>` when there's no valid session, otherwise the existing router; a `useSession()`-style read is available for `AppHeader` (Task 10) to show the logged-in employee + "Abmelden".

- [ ] **Step 1: Delete the replaced files**

```bash
git rm apps/employee-pwa/src/screens/TischLoginScreen.tsx apps/employee-pwa/src/data/workstation.ts
```

- [ ] **Step 2: Write `LoginScreen.tsx`**

```tsx
// apps/employee-pwa/src/screens/LoginScreen.tsx
import { useState, type FormEvent } from 'react';
import { Box, Button, TextField, Typography, Alert } from '@mui/material';
import { login, LoginError } from '../data/auth.js';
import type { Session } from '../data/session.js';

export interface LoginScreenProps {
  onLoggedIn: (session: Session) => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps): JSX.Element {
  const [employeeNo, setEmployeeNo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const session = await login(employeeNo.trim(), pin);
      onLoggedIn(session);
    } catch (err) {
      if (err instanceof LoginError) {
        setError('Mitarbeiternummer oder PIN ist falsch.');
      } else {
        setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 360, mx: 'auto', mt: 8, p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>Anmeldung</Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <TextField
        label="Mitarbeiternummer"
        value={employeeNo}
        onChange={(e) => setEmployeeNo(e.target.value)}
        fullWidth
        autoFocus
        sx={{ mb: 2 }}
      />
      <TextField
        label="PIN"
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        fullWidth
        sx={{ mb: 3 }}
      />
      <Button type="submit" variant="contained" fullWidth disabled={submitting || !employeeNo || !pin}>
        Anmelden
      </Button>
    </Box>
  );
}
```

- [ ] **Step 3: Rewrite `App.tsx`**

Read the current full `App.tsx` (79 lines) first — it currently: gates on `getWorkstation()`, renders `TischLoginScreen` if absent, else bootstraps via `seedIfEmpty()`/`loadAssignedWork()` and renders the router. Replace with:

```tsx
// apps/employee-pwa/src/App.tsx (gating section — keep the existing router/routes unchanged below this)
import { useEffect, useState } from 'react';
import { getSession, isSessionExpired, type Session } from './data/session.js';
import { LoginScreen } from './screens/LoginScreen.js';
// ...keep existing router/QueryClientProvider imports

export function App(): JSX.Element {
  const [session, setSessionState] = useState<Session | null>(() => {
    const existing = getSession();
    return existing && !isSessionExpired(existing) ? existing : null;
  });

  useEffect(() => {
    if (session && isSessionExpired(session)) {
      setSessionState(null);
    }
  }, [session]);

  if (!session) {
    return <LoginScreen onLoggedIn={setSessionState} />;
  }

  // ...existing router render, unchanged
}
```

Remove the `seedIfEmpty()`/`loadAssignedWork()` bootstrap call from `App.tsx` entirely — data loading now happens per-screen via React Query in Tasks 11–13, not as an app-level side effect.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter employee-pwa typecheck`
Expected: errors now concentrated in `BundleHomeScreen.tsx` (references `getWorkstation`, `DemoControls`) — expected, fixed in Task 10.

- [ ] **Step 5: Commit**

```bash
git add apps/employee-pwa/src/screens/LoginScreen.tsx apps/employee-pwa/src/App.tsx
git rm apps/employee-pwa/src/screens/TischLoginScreen.tsx apps/employee-pwa/src/data/workstation.ts
git commit -m "feat(employee-pwa): real LoginScreen, remove TischLoginScreen/workstation-claim"
```

---

### Task 9: Global 401 handling + `AppHeader` session display

**Files:**
- Modify: `apps/employee-pwa/src/components/AppHeader.tsx`
- Create: `apps/employee-pwa/src/data/apiErrorHandling.ts`

**Interfaces:**
- Produces: a shared response/error interceptor that, on any `401` from the API client, calls `clearSession()` and forces a re-render of `App` back to `LoginScreen` (simplest implementation: throw a distinguishable `SessionExpiredError` from the API wrapper, caught by a top-level React Query `onError`/error boundary that calls the same `setSessionState(null)` callback from Task 8 — thread it via a small event emitter or a React context, whichever matches the existing state-management style already used elsewhere in the app; check `bootstrapContext.tsx` for the established pattern before inventing a new one).

- [ ] **Step 1: Implement the 401 handler**

```ts
// apps/employee-pwa/src/data/apiErrorHandling.ts
import { clearSession } from './session.js';

export class SessionExpiredError extends Error {}

export function handleApiResponse<T>(response: { response: Response; data?: T; error?: unknown }): T {
  if (response.response.status === 401) {
    clearSession();
    throw new SessionExpiredError('Sitzung abgelaufen');
  }
  if (response.error) {
    throw new Error('API request failed');
  }
  return response.data as T;
}
```

Adapt the exact shape to whatever `@paket/api-client`'s (openapi-fetch) call sites actually return — read one existing call site in `db/sync.ts` (before its deletion in Task 11) to copy the real response shape (`{ data, error, response }` is openapi-fetch's standard shape; confirm against the actual generated client).

- [ ] **Step 2: Wire a session-expired listener into `App.tsx`**

In `App.tsx`, wrap the React Query `QueryClient`'s default `onError` (or add a query cache `onError` in the `QueryClientProvider` setup) to check `instanceof SessionExpiredError` and call `setSessionState(null)`.

- [ ] **Step 3: Update `AppHeader.tsx`**

Read the current `AppHeader.tsx` first. Add: display of `session.displayName` and the employee's assigned Tisch (passed as a prop from whichever screen has it after Task 11's `/api/me/today` fetch — thread `workstationName?: string` through), plus an "Abmelden" button calling `logout()` from `data/auth.ts` then forcing the app back to `LoginScreen`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter employee-pwa typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/employee-pwa/src/data/apiErrorHandling.ts apps/employee-pwa/src/components/AppHeader.tsx apps/employee-pwa/src/App.tsx
git commit -m "feat(employee-pwa): global 401 handling + header session display"
```

---

### Task 10: Delete Dexie/demo scaffolding, replace `db/types.ts` with plain types

**Files:**
- Delete: `apps/employee-pwa/src/db/` (entire directory: `db.ts`, `sync.ts`, `sync.test.ts`, `repository.ts`, `repository.test.ts`, `seed.ts`, `collectStops.ts`, `types.ts`)
- Delete: `apps/employee-pwa/src/demo/` (entire directory: `scenarios.ts`, `scenarios.test.ts`)
- Delete: `apps/employee-pwa/src/domain/exampleAssignment.ts`
- Delete: `apps/employee-pwa/src/components/DemoControls.tsx`
- Create: `apps/employee-pwa/src/domain/types.ts` (plain TypeScript types replacing `db/types.ts`'s type-only exports — `BelegListItem`, `BelegStatus`, `GoodsCategory`, `BundleContext`, `BundleProgress`, `CollectStop`, `CaseAggregate`, `CaseProgress`)

**Interfaces:**
- Produces: the same type names (`BelegListItem`, `BelegStatus`, `GoodsCategory`, `BundleContext`, `BundleProgress`, `CollectStop`, `CaseAggregate`, `CaseProgress`) re-exported from `domain/types.ts` instead of `db/types.ts`, so Tasks 11–13 (screens/hooks) import from a stable location. These should either be re-exports of the already-generated `@paket/api-client`/`@paket/domain-types` response types (preferred — check whether `/api/me/today`'s response shape in `packages/api-client/src/generated/schema.ts` already defines equivalent types before hand-writing new ones) or thin aliases over them.

- [ ] **Step 1: Read `db/types.ts` in full** to get the exact current type definitions that need to survive the move.

- [ ] **Step 2: Check for existing generated equivalents**

Run: `grep -n "BundleContext\|CollectStop\|BelegListItem\|CaseAggregate" packages/api-client/src/generated/schema.ts packages/domain-types/src/*.ts`
If equivalents exist, prefer re-exporting/aliasing them in `domain/types.ts`. If not, port the exact type definitions verbatim from `db/types.ts` into `domain/types.ts` (dropping any Dexie-specific fields like table primary keys that only existed for IndexedDB indexing).

- [ ] **Step 3: Create `domain/types.ts`** with the ported/aliased types.

- [ ] **Step 4: Delete the directories**

```bash
git rm -r apps/employee-pwa/src/db apps/employee-pwa/src/demo apps/employee-pwa/src/domain/exampleAssignment.ts apps/employee-pwa/src/components/DemoControls.tsx
```

- [ ] **Step 5: Typecheck (expect many errors)**

Run: `pnpm --filter employee-pwa typecheck`
Expected: errors in every file listed in the plan's research (Task 19/20 grep results): `BundleHomeScreen.tsx`, `BelegProcessScreen.tsx`, `workflowModel.ts`, `useBundle.ts`, `collect.ts`, `useCaseFlow.ts`, `belegList.ts`, `issueTarget.ts`, `eventLog.ts`, `useFocusRefresh.ts`, plus their `*.test.ts` files. This is expected — each gets fixed in Tasks 11–13. Do not attempt to fix them all here; just confirm the error set matches this list (no unexpected files broken).

- [ ] **Step 6: Commit**

```bash
git add apps/employee-pwa/src/domain/types.ts
git commit -m "refactor(employee-pwa): delete Dexie/demo scaffolding, add plain domain types"
```

---

### Task 11: React Query data hooks replacing `db/sync.ts` + `db/repository.ts`

**Files:**
- Create: `apps/employee-pwa/src/data/useMeToday.ts`
- Create: `apps/employee-pwa/src/data/useCaseAggregate.ts`
- Create: `apps/employee-pwa/src/data/useNextBundle.ts` (mutation for `POST /api/me/next-bundle`)
- Create: `apps/employee-pwa/src/data/useParkRemaining.ts` (mutation for `POST /api/me/park`)
- Test: `apps/employee-pwa/src/data/useMeToday.test.tsx`

**Interfaces:**
- Consumes: `getApiClient()` from Task 7's `api.ts`, `handleApiResponse` from Task 9.
- Produces: `useMeToday(): UseQueryResult<MeTodayResponse>` (query key `['me', 'today']`), `useCaseAggregate(caseId: string): UseQueryResult<CaseAggregate>` (query key `['me', 'case', caseId, 'aggregate']`), `useRequestNextBundle(): UseMutationResult<void, Error, void>`, `useParkRemaining(): UseMutationResult<void, Error, void>` — consumed by Task 12's screen rewrites, replacing every `useLiveQuery(() => db....)` call site found in the research grep.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/employee-pwa/src/data/useMeToday.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMeToday } from './useMeToday.js';
import * as apiModule from './api.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMeToday', () => {
  it('fetches /api/me/today via the api client', async () => {
    const mockGet = vi.fn().mockResolvedValue({ data: { bundle: null, routeStops: [] }, error: undefined, response: { status: 200 } });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({ GET: mockGet } as any);

    const { result } = renderHook(() => useMeToday(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/api/me/today');
    expect(result.current.data).toEqual({ bundle: null, routeStops: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter employee-pwa exec vitest run src/data/useMeToday.test.tsx`
Expected: FAIL — `useMeToday.js` does not exist.

- [ ] **Step 3: Implement `useMeToday.ts`**

```ts
// apps/employee-pwa/src/data/useMeToday.ts
import { useQuery } from '@tanstack/react-query';
import { getApiClient } from './api.js';
import { handleApiResponse } from './apiErrorHandling.js';

export function useMeToday() {
  return useQuery({
    queryKey: ['me', 'today'],
    queryFn: async () => {
      const response = await getApiClient().GET('/api/me/today');
      return handleApiResponse(response);
    },
  });
}
```

Match the exact generated method name/path if `/api/me/today` isn't the literal path string the generated client expects (openapi-fetch types paths as literal strings from the schema — check `packages/api-client/src/generated/schema.ts` for the exact path key).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter employee-pwa exec vitest run src/data/useMeToday.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the remaining three hooks** following the identical pattern (query for `useCaseAggregate`, mutation with `useMutation` + `queryClient.invalidateQueries(['me', 'today'])` on success for the other two). Write one test per hook mirroring Step 1–4's structure before implementing each (TDD — do not batch all four implementations before any test).

- [ ] **Step 6: Commit**

```bash
git add apps/employee-pwa/src/data/useMeToday.ts apps/employee-pwa/src/data/useMeToday.test.tsx apps/employee-pwa/src/data/useCaseAggregate.ts apps/employee-pwa/src/data/useNextBundle.ts apps/employee-pwa/src/data/useParkRemaining.ts
git commit -m "feat(employee-pwa): React Query hooks for /api/me/* replacing Dexie reads"
```

---

### Task 12: Rewrite `BundleHomeScreen.tsx` to use the new hooks

**Files:**
- Modify: `apps/employee-pwa/src/screens/BundleHomeScreen.tsx`

**Interfaces:**
- Consumes: `useMeToday`, `useRequestNextBundle`, `useParkRemaining` from Task 11; types from `domain/types.ts` (Task 10).

- [ ] **Step 1: Read the full current `BundleHomeScreen.tsx`** to identify every Dexie-derived value it renders (`useLiveQuery(() => db...)` calls, `getWorkstation()`, `DemoControls`, `cycleDemoScenario`).

- [ ] **Step 2: Replace data sourcing**

Replace each `useLiveQuery(() => db.<table>...)` call with the equivalent derived value from `useMeToday()`'s returned data (the `/api/me/today` response already carries `bundle`, `routeStops`, positions per the CLAUDE.md domain notes — confirm the exact response shape against `packages/api-client/src/generated/schema.ts` and map fields 1:1, do not invent new field names). Replace `getWorkstation()?.name` with the workstation name embedded in the `/api/me/today` response (per the design: Tisch is admin-assigned and returned from the backend, not client-claimed). Remove the `{!isBackendEnabled && demoControlsEnabled ? <DemoControls /> : null}` block entirely (no replacement — DemoControls is gone).

- [ ] **Step 3: Replace mutations**

Any button currently calling `pullNextBundle()`/`parkRemainingBelege()` (from the now-deleted `db/sync.ts`) now calls `useRequestNextBundle().mutate()` / `useParkRemaining().mutate()`, with a loading/disabled state on the button while the mutation is `isPending` and an inline error message on failure (per design B4 — no silent drop, explicit retry).

- [ ] **Step 3b: Empty/error states (design A4)**

Add explicit branches in `BundleHomeScreen.tsx` for: (a) `useMeToday()`'s data has no `bundle` (employee has no shift today or nothing assigned yet) → render a friendly message, e.g. "Kein Bündel zugeteilt. Bitte an den Teamlead wenden." instead of an empty/broken list; (b) `useMeToday()` is in an error state unrelated to auth (network failure, not 401) → render the shared connection-error banner from Task 9 with a manual retry button, not a blank screen. Wrong-login (bad employeeNo/PIN) is already handled in `LoginScreen.tsx` (Task 8, Step 2's `error` state) — no change needed here.

- [ ] **Step 4: Typecheck this file in isolation**

Run: `pnpm --filter employee-pwa exec tsc --noEmit -p tsconfig.json` (or the project's usual single-file check) and confirm `BundleHomeScreen.tsx` no longer appears in the error list.

- [ ] **Step 5: Update/rewrite this screen's existing tests** (if `BundleHomeScreen` has a `*.test.tsx` — check first) to mock the new hooks instead of a Dexie fixture.

- [ ] **Step 6: Commit**

```bash
git add apps/employee-pwa/src/screens/BundleHomeScreen.tsx
git commit -m "refactor(employee-pwa): BundleHomeScreen reads live /api/me/today via React Query"
```

---

### Task 13: Rewrite `BelegProcessScreen.tsx`, `useBundle.ts`, `useCaseFlow.ts`, `collect.ts`, `belegList.ts`, `issueTarget.ts`, `workflowModel.ts`, `eventLog.ts`, `useFocusRefresh.ts`

**Files:**
- Modify: `apps/employee-pwa/src/screens/BelegProcessScreen.tsx`
- Modify: `apps/employee-pwa/src/workflow/useBundle.ts`
- Modify: `apps/employee-pwa/src/workflow/useCaseFlow.ts`
- Modify: `apps/employee-pwa/src/workflow/collect.ts`
- Modify: `apps/employee-pwa/src/workflow/belegList.ts`
- Modify: `apps/employee-pwa/src/workflow/issueTarget.ts`
- Modify: `apps/employee-pwa/src/workflow/workflowModel.ts`
- Modify: `apps/employee-pwa/src/events/eventLog.ts` (or delete if its sole purpose was mirroring to Dexie — check first: if `eventLog.ts` only exists to log into `db.events` for the offline audit trail, delete it and its call sites instead of porting it)
- Modify: `apps/employee-pwa/src/data/useFocusRefresh.ts`
- Modify: `apps/employee-pwa/src/data/persist.ts` (simplify: every `persist*` function becomes the *only* write path — no more "local write first, best-effort POST second"; a failed POST now surfaces as a thrown error the caller must handle, not a swallowed failure)
- Modify: `apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx` (if it touches Dexie/persist — check first)

**Interfaces:**
- Consumes: `useCaseAggregate` from Task 11, `handleApiResponse` from Task 9.
- Produces: `useCaseFlow(caseId: string)` returns the same public shape screens already consume (read `useCaseFlow.ts` in full first to enumerate its exact current return type — likely `{ aggregate, progress, commit, isCommitting, ... }`), but backed entirely by React Query state instead of Dexie + best-effort POST.

- [ ] **Step 1: Read all nine files listed above in full.** This task touches the most business logic in the plan — do not skip reading any of them; `belegList.ts`/`collect.ts`/`issueTarget.ts`/`workflowModel.ts` contain pure functions (list filtering, status derivation) that likely need **no changes at all** beyond updating their type imports to `domain/types.ts` (Task 10) — confirm this by checking whether each file's logic operates on the passed-in data or reaches into Dexie directly. Only `useBundle.ts`, `useCaseFlow.ts`, `eventLog.ts`, `useFocusRefresh.ts`, and the two screens touch Dexie/persist directly per the research grep.

- [ ] **Step 2: Update the four pure-logic files' imports only**

For `collect.ts`, `belegList.ts`, `issueTarget.ts`, `workflowModel.ts`: change `from '../db/types.js'` to `from '../domain/types.js'`. No other changes if Step 1 confirms they take data as parameters rather than reading Dexie.

- [ ] **Step 3: Run their existing unit tests**

Run: `pnpm --filter employee-pwa exec vitest run src/workflow/collect.test.ts src/workflow/belegList.test.ts src/workflow/issueTarget.test.ts src/workflow/workflowModel.test.ts`
Expected: PASS unchanged (these test pure functions, not the data layer) — if any test imports `exampleAggregate` from the now-deleted `domain/exampleAssignment.ts`, replace that fixture with an inline literal object of the same shape (matching `CaseAggregate`) defined directly in the test file.

- [ ] **Step 4: Rewrite `useBundle.ts`**

Read it in full (currently: `useLiveQuery` over `db.bundle`/`db.collectStops`/`db.belege` + repository writes). Replace with a hook that derives `BundleContext`/`BundleProgress`/`BelegListItem[]`/`CollectStop[]` from `useMeToday()`'s query data (pure mapping functions, reusing `belegList.ts`'s existing derivation logic where it already does this kind of shaping — do not duplicate logic that already exists there).

- [ ] **Step 5: Rewrite `useCaseFlow.ts`**

Read it in full (currently: local Dexie write + `eventLog` append + best-effort POST via `persist.ts`). Replace `commit()` with: optimistic React Query cache update on the relevant query key → await the real `persist*` POST → on success, invalidate the query; on failure, roll back the optimistic update and surface the error (per design B2/B4 — throw, don't swallow). Delete the `eventLog.ts` import/call if Step 1 determined it was Dexie-only audit mirroring with no remaining purpose (if it served another purpose — e.g. feeding a UI activity feed — port that piece instead of deleting it; verify before deleting).

- [ ] **Step 6: Simplify `persist.ts`**

Remove the "local write happened, this POST is best-effort" comment/behavior; each `persist*` function becomes a plain awaited POST that throws on non-2xx (via `handleApiResponse`).

- [ ] **Step 7: Update `BelegProcessScreen.tsx` and `ProblemMeldenScreen.tsx`**

Replace their direct `db` imports/`useLiveQuery` calls with the rewritten `useCaseFlow`/`useBundle` hooks' outputs. Add a visible retry affordance wherever a mutation's error state is now surfaced (per B4).

- [ ] **Step 8: Update `useFocusRefresh.ts`**

Read it in full (currently calls `loadAssignedWork()` on window focus). Replace with `queryClient.invalidateQueries(['me', 'today'])`.

- [ ] **Step 9: Full typecheck**

Run: `pnpm --filter employee-pwa typecheck`
Expected: 0 errors in `apps/employee-pwa`.

- [ ] **Step 10: Run the full unit test suite**

Run: `pnpm --filter employee-pwa test`
Expected: all green; fix any test still referencing deleted Dexie fixtures by inlining literal fixture objects (per Step 3's pattern).

- [ ] **Step 11: Commit**

```bash
git add apps/employee-pwa/src/screens apps/employee-pwa/src/workflow apps/employee-pwa/src/data/persist.ts apps/employee-pwa/src/data/useFocusRefresh.ts apps/employee-pwa/src/events
git commit -m "refactor(employee-pwa): workflow hooks + screens use live backend, remove outbox pattern"
```

---

### Task 14: `package.json` cleanup + service worker scope check

**Files:**
- Modify: `apps/employee-pwa/package.json`
- Modify: `apps/employee-pwa/vite.config.ts`

- [ ] **Step 1: Remove unused dependencies**

Run: `grep -rl "dexie\|fake-indexeddb" apps/employee-pwa/src apps/employee-pwa/e2e`
Expected: no matches (everything was removed in Tasks 10–13). Then remove from `package.json`: `dexie`, `dexie-react-hooks`, `fake-indexeddb`. Check whether `workbox-window` is still needed for install-prompt/update-notification UX (likely yes, for app-shell PWA install) — keep it only if it's used for something other than data caching; confirm via `grep -rn "workbox-window" apps/employee-pwa/src`.

- [ ] **Step 2: Reinstall**

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 3: Verify service worker scope**

Read `apps/employee-pwa/vite.config.ts`'s `VitePWA` config in full. Confirm `globPatterns` only covers app-shell assets (`**/*.{js,css,html,svg,woff2}` per the research) and there is no `runtimeCaching` entry matching `/api/`. If one exists, remove it. If none exists (as the research suggests), add a one-line comment noting this was verified, and move on — no code change needed.

- [ ] **Step 4: Full build**

Run: `pnpm --filter employee-pwa build`
Expected: succeeds with no Dexie/demo references in the output bundle.

- [ ] **Step 5: Commit**

```bash
git add apps/employee-pwa/package.json apps/employee-pwa/pnpm-lock.yaml apps/employee-pwa/vite.config.ts
git commit -m "chore(employee-pwa): remove Dexie/demo dependencies, verify SW scope excludes API caching"
```

---

### Task 15: SSE live-update wiring

**Files:**
- Create: `apps/employee-pwa/src/data/useLiveUpdates.ts`
- Modify: `apps/employee-pwa/src/App.tsx` (mount the subscription once, at the top level, after login)

**Interfaces:**
- Consumes: `apiBaseUrl` from `api.ts`, `getSession` from `session.ts`, the existing `GET /api/me/stream` SSE endpoint (already scoped server-side to `principal.employeeNo` per the research — no backend change needed here).
- Produces: a hook that opens an `EventSource` against `/api/me/stream` with the session token, and on any message calls `queryClient.invalidateQueries(['me', 'today'])`.

- [ ] **Step 1: Implement the hook**

```ts
// apps/employee-pwa/src/data/useLiveUpdates.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiBaseUrl } from './api.js';
import { getSession } from './session.js';

export function useLiveUpdates(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const session = getSession();
    if (!session) return undefined;

    // EventSource doesn't support custom headers; if the SSE endpoint requires
    // a bearer header rather than a query-param token, check how the existing
    // teamlead cockpit's SSE consumer authenticates (apps/teamlead-web) and
    // mirror that exact mechanism instead of assuming a query param works.
    const source = new EventSource(`${apiBaseUrl}/api/me/stream?token=${encodeURIComponent(session.token)}`);
    source.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    };
    return () => source.close();
  }, [queryClient]);
}
```

Before finalizing, read how `apps/teamlead-web` (or the `LiveController`/`LiveStatusService` backend code) actually authenticates SSE connections — `EventSource` cannot set an `Authorization` header, so confirm whether the backend already accepts a `?token=` query param for `/api/me/stream`/`/api/teamlead/stream`, or whether a different mechanism (short-lived SSE ticket, cookie) is expected. If the backend doesn't yet support query-param auth for SSE, add that support to `LiveController`/the guard chain as a small addition (documented here as a dependency, not deferred silently) rather than falling back to polling — polling is the fallback named in the design only if this truly can't be done.

- [ ] **Step 2: Mount it in `App.tsx`**

Call `useLiveUpdates()` once, inside the authenticated branch of `App` (after `session` is confirmed non-null).

- [ ] **Step 3: Manual verification**

Run the dev stack (`pnpm dev` per memory note `local-dev-run-stack`), log in as a seeded employee in one browser tab, reassign their bundle from the teamlead cockpit in another tab, confirm the employee tab's view updates without a manual refresh within a few seconds.

- [ ] **Step 4: Commit**

```bash
git add apps/employee-pwa/src/data/useLiveUpdates.ts apps/employee-pwa/src/App.tsx
git commit -m "feat(employee-pwa): live-update subscription via /api/me/stream"
```

---

### Task 16: E2E rewrite against a seeded backend

**Files:**
- Modify: `apps/employee-pwa/playwright.config.ts`
- Modify: `apps/employee-pwa/e2e/employee-flow.spec.ts`
- Create: `apps/employee-pwa/e2e/fixtures/seed.ts` (or reuse an existing backend seeding helper if `apps/backend-api` already exposes one for its own e2e/int tests — check first, e.g. `apps/backend-api/src/integration/*.int.test.ts`'s seed pattern, or a `prisma/seed.ts`)

**Interfaces:**
- Produces: two seeded employees (`ma-101` PIN `4711`, `ma-102` PIN `4712`) with distinct assigned bundles, used by the rewritten spec.

- [ ] **Step 1: Read the current `playwright.config.ts` and `employee-flow.spec.ts` in full** (37 and 252 lines respectively, already fetched in research) to preserve every assertion that's still valid (screen navigation, element selectors) and identify every assertion tied to the offline seed (`Arbeitsplatz: T-04`, `loginAndLoad()`) that must change.

- [ ] **Step 2: Update `playwright.config.ts`**

Replace the `webServer` command's `VITE_API_BASE_URL= VITE_DEV_TOKEN= VITE_DEMO_CONTROLS=1` offline toggle with a real backend URL pointing at a seeded test instance (`VITE_API_BASE_URL=http://localhost:3000`), and add a `globalSetup` (or a `webServer` array entry) that starts `apps/backend-api` against a test database and runs the seed script from Step 1's fixture before tests run — mirror whatever pattern `apps/teamlead-web`'s Playwright config already uses to stand up a live backend for its own e2e (check `apps/teamlead-web/playwright.config.ts` first; reuse its exact approach rather than inventing a new one).

- [ ] **Step 3: Rewrite `loginAndLoad()` (and any other offline-seed helper) in `employee-flow.spec.ts`**

Replace the old Tisch-Anmeldung (`T-04`) flow with: navigate to the app, fill employeeNo `ma-101` + PIN `4711` on the new `LoginScreen`, submit, wait for the bundle home screen. Keep every downstream assertion about the bundle/Beleg flow that doesn't depend on demo-scenario specifics — replace scenario-specific expectations (item counts, article names from `DEMO_SCENARIOS`) with the values from the seed fixture instead.

- [ ] **Step 4: Add the multi-employee isolation test (C2)**

```ts
test('two employees see only their own bundle', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await loginAs(pageA, 'ma-101', '4711');
  await loginAs(pageB, 'ma-102', '4712');

  await expect(pageA.getByText(/Bündel/)).toContainText(/* ma-101's seeded bundle identifier */);
  await expect(pageB.getByText(/Bündel/)).toContainText(/* ma-102's seeded bundle identifier */);

  await contextA.close();
  await contextB.close();
});
```

Fill in the seeded bundle identifiers from the fixture created in Step 1.

- [ ] **Step 5: Run the e2e suite**

Run: `pnpm --filter employee-pwa exec playwright test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/employee-pwa/playwright.config.ts apps/employee-pwa/e2e
git commit -m "test(e2e): rewrite employee-pwa e2e against a seeded live backend"
```

---

### Task 17: Docs — architecture diagrams + handbook + memory

**Files:**
- Modify: `docs/architecture/src/c3-employee-pwa-components.mmd`
- Modify: `docs/architecture/src/type-pipeline.mmd` (only if Task 6 added Zod schemas to `domain-types`)
- Modify: `docs/handbook/` — find and update the Mitarbeiter login chapter (check `docs/handbook/` structure first per the `end-user-handbook` memory note — Teil A a1-a7)
- Modify: memory note file for `employee-pwa-bundle-flow-rebuild` (via the memory system, not a repo file)

- [ ] **Step 1: Update the C4 component diagram**

Open `docs/architecture/src/c3-employee-pwa-components.mmd`, remove the Dexie/offline-mirror boxes and any "demo scenario" component, add `LoginScreen`, `session.ts`/`auth.ts`, and the React Query data hooks as components with edges to the backend `/api/auth/login` and `/api/me/*` endpoints.

- [ ] **Step 2: Re-render**

Run: `cd docs/architecture && ./render.sh`
Expected: `docs/architecture/rendered/c3-employee-pwa-components.svg` regenerated with no Mermaid syntax errors.

- [ ] **Step 3: Update the handbook**

Read the existing Mitarbeiter chapter covering login/Arbeitsplatz (per the `end-user-handbook` memory note, Teil A). Rewrite the "Anmeldung" section to describe: enter Mitarbeiternummer + PIN, see your assigned Tisch automatically, no Tisch-scan step. Remove any screenshot/flow description of the old Tisch-Anmeldung screen.

- [ ] **Step 4: Update the persistent memory note**

Update the `employee-pwa-bundle-flow-rebuild` memory entry (per the memory-system instructions in this session) to note that the offline/Dexie scaffolding described there has been removed and replaced with live backend calls + real login, linking to this plan's date.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/src/c3-employee-pwa-components.mmd docs/architecture/rendered/c3-employee-pwa-components.svg docs/handbook
git commit -m "docs(architecture): employee-pwa login + live-data update, drop offline diagram"
```

(The memory-note update is saved through the memory system directly, not via this git commit.)

---

### Task 18: Full quality gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: 13/13 green (or the current baseline count if a new package was added to the graph).

- [ ] **Step 2: Full test suite**

Run: `pnpm test` (unit) and the backend's integration script (check `apps/backend-api/package.json` for the exact `test:int` command name)
Expected: all green.

- [ ] **Step 3: E2E**

Run: `pnpm --filter employee-pwa exec playwright test` and `pnpm --filter teamlead-web exec playwright test` (confirm the teamlead suite is unaffected by any shared-package changes from Task 6).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: all apps build clean, no Dexie/demo references anywhere in `apps/employee-pwa/dist`.

- [ ] **Step 5: OpenAPI consistency check**

Run whatever consistency check the repo already uses (per memory note `quality-suite-and-integration`, `§17 pre-pilot suite`) to confirm the OpenAPI spec, `api-client`, and `domain-types` are in sync after Task 6.

- [ ] **Step 6: Manual end-to-end smoke test**

Start the dev stack (`pnpm dev`), open two browser tabs, log in as two different seeded employees, walk one through the full happy path (login → Tisch shown → Ware holen → Beleg bearbeiten → Positionen → erledigt/Teilabschluss → nächstes Pack anfordern → Abmelden), and confirm each step is visible live in the teamlead cockpit (per C1/C2/C3 in the design spec).

- [ ] **Step 7: Final commit (if any gate fixes were needed)**

```bash
git add -A
git commit -m "fix: quality gate cleanup for employee-pwa real login rework"
```
