# Employee PWA — Real Login + Offline Scaffolding Removal

Date: 2026-07-06

## Problem

`apps/employee-pwa` has no login screen. Identity comes from a build-time
`VITE_DEV_TOKEN` env var (or a hardcoded `ma-101` fallback). The app is
offline-first: a Dexie mirror (`db/`), a demo seed + `DemoControls`, and a
best-effort outbox stand in for a real backend integration. This must become
a fully working pilot app: real login, live data only, no offline illusion.

## Decisions

- **Login method**: employee number + PIN (numeric keypad UI).
- **Token issuance**: new `POST /api/auth/login` in `backend-api`, reusing
  the existing `AUTH_DEV_PRIVATE_KEY` / `jose` JWT minting and the claim
  shape `OidcTokenVerifier` already expects (`employee_no`,
  `realm_access.roles`, `name`). No new OIDC provider.
- **Session storage**: JWT in `localStorage`, client-side `exp` check, no
  refresh token. Simple, matches trusted on-site devices.
- **PIN provisioning**: admin sets/resets PIN per employee from the
  teamlead-web Admin "Mitarbeiter" tab. New hashed `pinHash` column on
  `User`.
- **Arbeitsplatz/Tisch**: `User.workstationId` is already a DB relation,
  admin-assigned (not chosen by the employee). The `TischLoginScreen` /
  workstation-claim step is deleted outright — the employee's assigned Tisch
  is read from their profile after login and displayed read-only.
- **Live updates**: reuse the existing SSE backbone (used by the teamlead
  cockpit) to invalidate `/api/me/today` on push; fall back to polling only
  if the existing channel can't be scoped to a single employee.

## Backend changes (`apps/backend-api`)

- `prisma/schema.prisma`: add `pinHash String?` to `User` + migration.
- `POST /api/auth/login` (`@Public()`): `{ employeeNo, pin }` →
  looks up `User`, verifies `pin` against `pinHash` (bcrypt), mints a
  short-lived (~12h) JWT. Wrong employeeNo/PIN → generic 401. Basic
  rate-limiting on the endpoint.
- Admin: `PATCH /api/admin/employees/:employeeNo/pin` — sets/resets PIN,
  hashed server-side, `@Roles(Role.Teamlead, Role.Admin)`.
- `/api/me/*` endpoints unchanged in shape — they already expect a verified
  bearer; only the token's origin changes (real login vs manual script).
- SSE: extend/scope the existing event channel so an authenticated employee
  receives push events for their own bundle/case only.
- OpenAPI: add `LoginRequest`/`LoginResponse`/pin-reset DTOs; regenerate
  `packages/api-client`. Add matching Zod schema(s) to `packages/domain-types`
  if other DTOs are client-validated the same way.

## Frontend changes (`apps/employee-pwa`)

**Delete outright** (no compat shims):
- `db/` (Dexie mirror + `seed.ts`)
- `demo/scenarios.ts`, `domain/exampleAssignment.ts`,
  `components/DemoControls.tsx`
- `screens/TischLoginScreen.tsx`, workstation-claim logic in
  `data/workstation.ts`
- `isBackendEnabled` / `devToken` / `demoControlsEnabled` branches in
  `data/api.ts`
- `dexie`, `dexie-react-hooks`, `workbox-window`-driven data caching,
  `fake-indexeddb` from `package.json` (drop unused deps)

**Add**:
- `screens/LoginScreen.tsx`: employeeNo + PIN form → `POST /api/auth/login`
  → store session → route into the app.
- `data/session.ts`: real `getSession`/`setSession`/`clearSession`/
  `isExpired`, replacing the JWT-decode-from-env-token logic.
- React Query hooks over `/api/me/*` replacing all Dexie reads; mutations
  (collect check-off, Position geprüft, Mehr-/Mindermenge,
  Preisetikett/Sicherung, Beleg erledigt, Teilabschluss, Problem melden,
  Parken, "nächstes Pack anfordern") go straight to the backend with
  optimistic UI + rollback on failure — no local-write-then-best-effort-POST,
  no outbox.
- `App.tsx`: gate on session (not workstation); global 401 handling →
  clear session → back to `LoginScreen`; header shows employee name +
  assigned Tisch (from `/api/me/today`) + "Abmelden".
- Shared connection-error banner + retry for failed requests (no silent
  drops, no offline fallback).
- Service worker: keep app-shell caching only; verify (and remove if
  present) any runtime caching of `/api/*` responses.

## Testing

- Backend: unit tests for login (bad PIN, unknown employeeNo, rate limit,
  pin-reset authorization); integration test that a minted token round-trips
  through `JwtAuthGuard`/`RolesGuard`.
- Frontend e2e: rewrite `playwright.config.ts` + `employee-flow.spec.ts`
  against a seeded backend (no `VITE_API_BASE_URL=` offline toggle) — log in
  as a seeded employee with a known PIN, run the full happy path
  (login → bundle → collect → positions → erledigt/Teilabschluss →
  next-pack → logout). Add a second seeded employee to cover multi-device
  isolation (each sees only their own bundle) and a teamlead-reassignment
  reflected on the employee device.

## Docs

- `docs/architecture/src/c3-employee-pwa-components.mmd`: remove Dexie/
  offline boxes, add Login/session components; re-render via `./render.sh`.
- `docs/architecture/src/type-pipeline.mmd`: add new auth DTOs if the
  pipeline changes.
- `docs/handbook`: rewrite the Mitarbeiter login chapter for the real flow
  (no Tisch-selection step, no offline mode).
- Update memory note `employee-pwa-bundle-flow-rebuild` to reflect the
  offline-scaffolding removal.

## Out of scope

- Full OIDC provider integration (Keycloak etc.) — deferred.
- Refresh-token flow — deferred (simple exp-check is enough for pilot).
- Employee self-service PIN change — admin-managed only for now.

## Risks / things to verify before deleting

- Confirm nothing in `teamlead-web` or the assignment engine imports from
  `employee-pwa`'s `db/`, `demo/`, or `domain/exampleAssignment.ts` (expected:
  nothing, these are employee-pwa-local, but verify before deleting).
- Confirm the existing SSE channel can be scoped per-employee before
  wiring it in; fall back to polling `/api/me/today` if not.
