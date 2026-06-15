# Automatik Wiring — Frontends → Real Assignment Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Automatik" real — the teamlead presses *Neu berechnen* and the deterministic assignment engine actually bundles the open pool; the employee presses *Starten* and works the package the engine assigned. Replace the static mock datasets in both frontends with live backend data, and make the UX express what is really happening (loading, empty, error, assigned-vs-reserve).

**Architecture:** The backend already owns the truth: `assignWork()` (pure engine) → `AssignmentService.recalculate()` persists bundles/cases/route-stops + hash-chained audit events. The gap is purely **read endpoints + frontend wiring**. We add 5 GET read endpoints, regenerate the typed `@paket/api-client`, then swap each frontend's mock data-source for API calls behind the SAME seam functions the UI already uses (`buildCockpitSummary`, `getActiveBundle`), so component code barely changes. SSE (`/api/teamlead/stream`, `/api/me/stream`) drives live updates. Mutators (park/prioritize/recalculate) become POSTs with optimistic UI.

**Tech Stack:** NestJS-on-Fastify + Prisma 6 + PostgreSQL (backend), `openapi-fetch` typed client (`@paket/api-client`), React + MUI v6 + TanStack Query (teamlead-web), React + MUI + Dexie (employee-pwa), Vitest + Testcontainers + Playwright.

---

## Current State — the verified gap

- Both frontends run 100% on static mock files (`teamlead-web/src/data/mock.ts` via `loadMockDataset()`; `employee-pwa/src/db/seed.ts` via `seedIfEmpty()`). `@paket/api-client` is imported but **unused**.
- The "Starten"/"Starterpakete" buttons are pure `navigate(...)`. "Neu berechnen" runs a client-side `simulateRecalculation()` — NOT the real engine.
- The real engine path (`assignWork` → `recalculate` → `POST /api/teamlead/assignments/recalculate`) is fully built and tested but never called from the UI.
- KPI tiles: capacity/pool/audit are live in-memory off the mock; ZST tiles (88 parts, 21 points, 22/h, 5.25/h) are **hardcoded constants** in `mock.ts`.

### Backend HTTP surface that already EXISTS (reuse, don't rebuild)
- `POST /api/teamlead/assignments/recalculate` → `RecalculateResultDto { date, bundleCount, assignedCaseCount, unassignedCaseCount, reserveMinutes, durationMs, loads: EmployeeLoadDto[] }`
- `GET /api/teamlead/dashboard` → `DashboardDto { countsByStatus, poolSize, prioOpen, oldestOpenBookingDate }`
- `GET /api/teamlead/cases` (paged pool) → `PoolListDto { items: PoolItemDto[], total, page, limit }`
- `POST /api/teamlead/cases/:id/prioritize | park | unpark`, `POST /api/teamlead/issues/:id/resolve | release`
- `GET /api/me/today` → `TodayResponseDto { date, bundle: CurrentBundleDto|null, cases: CaseSummaryDto[] }`, `GET /api/me/current-bundle`
- `POST /api/cases/:id/start-preparation | complete | partial-complete`, `POST /api/issues`
- SSE `GET /api/me/stream`, `GET /api/teamlead/stream` (payload `{ caseId, status, eventType?, employeeNo?, at }`, message type `"case-status"`)
- `GET /healthz`, `GET /readyz`

### Endpoints / tooling that are MISSING (build tasks below)
1. `GET /api/teamlead/board` — assigned bundles + member cases + route stops + per-employee load
2. `GET /api/teamlead/capacity` — net / planned / reserve / utilisation
3. `GET /api/teamlead/kpis` — ZST progress + `KpiSnapshot`
4. `GET /api/teamlead/events` — readable audit/override log
5. `GET /api/me/cases/:caseId/aggregate` — positions + box targets + work-instruction header (PWA `CaseAggregate`)
6. Dev seed script (users/shifts/locations/ready-cases)
7. Dev auth path (`AUTH_DEV_PUBLIC_KEY` + a token-minting helper) — no IdP for local/dev

> **Scope note:** Cockpit manual bundle-edit mutators (`withdrawCase`, `addCaseToBundle`, `reorderBundle`, `pauseBundle`) have no backend endpoint. They are **out of scope** for this plan — keep them client-only/disabled until a later "manual override" plan. This plan wires the read path + the three mutators that DO have endpoints (park/unpark, prioritize, recalculate).

---

## File Structure

**Backend (`apps/backend-api/src`)**
- `cases/teamlead.controller.ts` — add 4 GET handlers (board/capacity/kpis/events)
- `cases/teamlead.service.ts` — add read methods (`getBoard`, `getCapacity`, `getKpis`, `getEvents`)
- `cases/me.controller.ts` — add `GET cases/:caseId/aggregate`
- `cases/cases.service.ts` — add `getCaseAggregate(principal, caseId)`
- `cases/cases.dto.ts` — add `BoardDto`, `BoardRowDto`, `CapacityDto`, `KpiDto`, `AuditEventDto`, `CaseAggregateDto`
- `prisma/seed.ts` (new) — dev seed; register `prisma.seed` in `package.json`
- `auth/dev-token.ts` (new) — RS256 `mintDevToken`; `scripts/dev-token.ts` CLI
- `.env.example` — add `AUTH_DEV_PUBLIC_KEY`, `AUTH_DEV_PRIVATE_KEY` (dev only)

**Shared**
- `packages/api-client/openapi/openapi.json` + `src/generated/schema.ts` — regenerate after endpoints land

**teamlead-web (`apps/teamlead-web/src`)**
- `data/api.ts` (new) — `createApiClient` instance from env, token from `data/session.ts`
- `data/remoteDataset.ts` (new) — fetch board/capacity/kpis/events/dashboard → assemble the `CockpitSummary`/`BoardRow[]` shapes the components already read
- `data/store.tsx` — `CockpitDataProvider` uses TanStack Query against `remoteDataset`; mutators call POSTs + invalidate
- `data/queryClient.ts` (new) — QueryClient + provider
- `main.tsx` — wrap in `QueryClientProvider`
- `features/cockpit/CockpitPage.tsx` — loading/error/empty states; "Neu berechnen" → recalculate mutation

**employee-pwa (`apps/employee-pwa/src`)**
- `data/api.ts` (new) — api-client instance + session token
- `db/sync.ts` (new) — `loadAssignedWork()`: `GET /api/me/today` + per-case `aggregate` → write Dexie `bundles`/`aggregates`
- `db/seed.ts` — gate: real fetch when `VITE_API_BASE_URL` set, else keep example seed (demo fallback)
- `screens/TagesstartScreen.tsx` — "Starten" triggers `loadAssignedWork()` then navigates; loading/empty states

---

## PHASE 0 — Make the backend locally runnable (prerequisite)

### Task 0.1: Bring up infra + apply migrations

**Files:** none (commands only)

- [ ] **Step 1:** Start Postgres/Redis/MinIO. Run: `pnpm infra:up`. Expected: `postgres` healthy on 5432.
- [ ] **Step 2:** Apply migrations. Run: `pnpm db:migrate` with `DATABASE_URL=postgresql://paket:paket_dev_pw@localhost:5432/paketlager?schema=public`. Expected: two migrations applied, `prisma generate` succeeds.
- [ ] **Step 3:** Boot the API. Run: `pnpm --filter @paket/backend-api dev`. Expected: `:3000`; `curl localhost:3000/healthz` → `{"status":"ok"}`.

### Task 0.2: Dev auth (RS256) without an IdP

**Files:** Create `apps/backend-api/src/auth/dev-token.ts`, `apps/backend-api/scripts/dev-token.ts`; Modify `.env.example`, root `.env`

- [ ] **Step 1:** Generate a dev RS256 keypair (real keys only in gitignored `.env`).
  Run: `node -e "const {generateKeyPairSync}=require('crypto');const k=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});console.log(JSON.stringify(k))"`
- [ ] **Step 2:** Write `mintDevToken` with `jose` (already a backend dep).

```ts
// apps/backend-api/src/auth/dev-token.ts
import { importPKCS8, SignJWT } from 'jose';
import type { Role } from './rbac.js';

export async function mintDevToken(opts: {
  privateKeyPem: string; employeeNo: string; roles: Role[]; displayName?: string;
}): Promise<string> {
  const key = await importPKCS8(opts.privateKeyPem, 'RS256');
  return new SignJWT({
    employee_no: opts.employeeNo,
    realm_access: { roles: opts.roles },
    name: opts.displayName ?? opts.employeeNo,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(`dev:${opts.employeeNo}`)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key);
}
```

- [ ] **Step 3:** CLI `scripts/dev-token.ts` reads `AUTH_DEV_PRIVATE_KEY`, prints a token for `--role teamlead --employee tl-001`.
  Run: `pnpm --filter @paket/backend-api exec tsx scripts/dev-token.ts --role teamlead --employee tl-001`. Expected: a JWT on stdout.
- [ ] **Step 4:** Verify (with `AUTH_DEV_PUBLIC_KEY` set): `curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/teamlead/dashboard`. Expected: 200 JSON.
- [ ] **Step 5: Commit.** `feat(backend): dev RS256 token minting for local/CI auth`

### Task 0.3: Dev seed script

**Files:** Create `apps/backend-api/prisma/seed.ts`; Modify `apps/backend-api/package.json` (`"prisma": { "seed": "tsx prisma/seed.ts" }`)

- [ ] **Step 1:** Seed `User` rows whose `employeeNo` matches the dev tokens (`tl-001` teamlead; `ma-101/102/103` employees), 3 active `Shift`s for `2026-06-15` (480/300/420 net min), active `Location`s, ~14 `ready` `GoodsReceiptCase`s with realistic `priorityFlags`/quantities. Mirror `teamlead-web/src/data/mock.ts` so demo numbers stay recognizable. Upsert by natural key (idempotent).
- [ ] **Step 2:** Run: `pnpm --filter @paket/backend-api exec prisma db seed`. Expected: rows created; re-run idempotent.
- [ ] **Step 3:** Verify recalculate produces bundles: `curl -X POST -H "Authorization: Bearer $TL_TOKEN" -H 'content-type: application/json' -d '{"date":"2026-06-15"}' localhost:3000/api/teamlead/assignments/recalculate`. Expected: `bundleCount > 0`, `durationMs < 5000`.
- [ ] **Step 4: Commit.** `feat(backend): dev seed (users/shifts/locations/ready cases)`

---

## PHASE 1 — Backend read endpoints (TDD; one task per endpoint)

> Rhythm per endpoint: add DTO → write `*.int.test.ts` against Testcontainers Postgres (reuse the `lifecycle.int.test.ts` container + PrismaClient harness, seed via Task 0.3 logic) → implement service read → wire controller route → green → commit. Use `vitest.integration.config.ts`.

### Task 1.1: `GET /api/teamlead/board`

**Files:** Modify `cases.dto.ts`, `cases/teamlead.service.ts`, `cases/teamlead.controller.ts`; Test `src/integration/board.int.test.ts`

- [ ] **Step 1: DTO.**

```ts
// cases.dto.ts
export class BoardRouteStopDto { id!: string; sequence!: number; locationCode!: string; scanRequired!: boolean; scanned!: boolean; }
export class BoardCaseDto { id!: string; weBelegNo!: string; status!: string; totalQuantity!: number; estimatedMinutes!: number; effortPoints!: number; }
export class BoardRowDto {
  employeeNo!: string; employeeName!: string; bundleId!: string; bundleStatus!: string;
  plannedEffortMinutes!: number; capacityMinutes!: number;
  cases!: BoardCaseDto[]; routeStops!: BoardRouteStopDto[];
}
export class BoardDto { date!: string; rows!: BoardRowDto[]; reserveMinutes!: number; }
```

- [ ] **Step 2: Failing test.**

```ts
// board.int.test.ts (inside the seeded-container describe)
it('returns one board row per assigned bundle after recalculate', async () => {
  await assignment.recalculate(teamleadPrincipal, '2026-06-15');
  const board = await teamlead.getBoard('2026-06-15');
  expect(board.rows.length).toBeGreaterThan(0);
  expect(board.rows[0].cases.length).toBeGreaterThan(0);
  expect(board.rows[0].routeStops).toBeInstanceOf(Array);
  expect(board.reserveMinutes).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 3: Run → FAIL** (`getBoard` undefined). `pnpm --filter @paket/backend-api test:int -t board`
- [ ] **Step 4: Implement `getBoard`** — Prisma: bundles for the date `include: { items: { include: { case: true } }, routeStops: true }`; join shift capacity per employee; map to `BoardRowDto`; `reserveMinutes = Σ capacity − Σ planned`.
- [ ] **Step 5: Wire route.**

```ts
// teamlead.controller.ts
@Get('board')
getBoard(@Query('date') date?: string): Promise<BoardDto> {
  return this.teamlead.getBoard(date ?? todayIso());
}
```

- [ ] **Step 6: Run → PASS** + `pnpm --filter @paket/backend-api typecheck`.
- [ ] **Step 7: Commit.** `feat(backend): GET /api/teamlead/board`

### Task 1.2: `GET /api/teamlead/capacity`

**Files:** same trio + `src/integration/capacity.int.test.ts`

- [ ] **Step 1: DTO** `CapacityDto { date: string; plannedEmployees: number; netCapacityMinutes: number; plannedMinutes: number; reserveMinutes: number; utilisationPct: number }`.
- [ ] **Step 2: Failing test:** after recalculate, `netCapacityMinutes === Σ active shift net min`; `utilisationPct === round1(planned/net*100)`; `reserve === net − planned`.
- [ ] **Step 3: FAIL** → **Step 4: Implement** (read active shifts for date + bundle planned minutes; mirror `selectors.ts` capacity math) → **Step 5: route `@Get('capacity')`** → **Step 6: PASS** → **Step 7: Commit** `feat(backend): GET /api/teamlead/capacity`.

### Task 1.3: `GET /api/teamlead/kpis`

**Files:** same trio + `kpis.int.test.ts`

- [ ] **Step 1: DTO** `KpiDto { date; completedCases; totalCases; completedParts; effortPoints; workedMinutes; partsPerHour; effortPointsPerHour }` (mirror domain `KpiSnapshot`, `reporting.ts`).
- [ ] **Step 2: Failing test:** seed two `ZstRecord`s → `completedParts === Σ completedQuantity`, `effortPoints === Σ effortPoints`, `partsPerHour === round(parts / (workedMinutes/60))`. **Replaces the hardcoded 88/21/22/5.25 with computed values.**
- [ ] **Step 3: FAIL** → **Step 4: Implement** aggregate over `ZstRecord` + case statuses for the date → **Step 5: route** → **Step 6: PASS** → **Step 7: Commit** `feat(backend): GET /api/teamlead/kpis (live ZST rollup)`.

### Task 1.4: `GET /api/teamlead/events`

**Files:** same trio + `events-read.int.test.ts`

- [ ] **Step 1: DTO** `AuditEventDto { id; seq; at; actorType; actorId; eventType; entityType; entityId; action?: string; reason?: string }`; response `AuditEventDto[]`.
- [ ] **Step 2: Failing test:** after a `prioritize` POST, `GET events?actorType=teamlead` returns that event newest-first with `reason`.
- [ ] **Step 3: FAIL** → **Step 4: Implement** read `WorkflowEvent orderBy seq desc take limit`, optional `actorType`/`entityId` filter, project payload `action`/`reason` → **Step 5: route `@Get('events')` query `{ actorType?, entityId?, limit? (1-200, def 50) }`** → **Step 6: PASS** → **Step 7: Commit** `feat(backend): GET /api/teamlead/events (audit feed §8.4)`.

### Task 1.5: `GET /api/me/cases/:caseId/aggregate`

**Files:** Modify `me.controller.ts`, `cases.service.ts`, `cases.dto.ts`; Test `src/integration/me-aggregate.int.test.ts`

- [ ] **Step 1: DTO** `CaseAggregateDto { case: CaseSummaryDto; workInstruction: WorkInstructionHeaderDto; positions: ReceiptPositionDto[]; boxTargets: TransportBoxTargetDto[] }` (mirror domain `documents.ts` + `transport.ts`).
- [ ] **Step 2: Failing test:** seed a case with positions + box targets assigned to `ma-101`; `getCaseAggregate(ma101Principal, caseId)` returns them; a foreign employee gets `ForbiddenException` (reuse `case-access.policy`).
- [ ] **Step 3: FAIL** → **Step 4: Implement** Prisma read with positions + boxTargets + header, guarded by `caseAccessPolicy` → **Step 5: route `@Get('cases/:caseId/aggregate')` `@Roles(Employee)`** → **Step 6: PASS** → **Step 7: Commit** `feat(backend): GET /api/me/cases/:id/aggregate`.

### Task 1.6: Regenerate the OpenAPI spec + client

**Files:** `apps/backend-api/openapi.json`, `packages/api-client/openapi/openapi.json`, `packages/api-client/src/generated/schema.ts`

- [ ] **Step 1:** Regenerate backend spec. Run: `pnpm --filter @paket/backend-api run gen:openapi`.
- [ ] **Step 2:** Copy to api-client + regenerate types. Run: `pnpm --filter @paket/api-client run gen`.
- [ ] **Step 3:** Verify the 5 new paths appear in `schema.ts`. Run: `pnpm --filter @paket/api-client typecheck`.
- [ ] **Step 4:** Add a CI drift guard: a test that `diff`s `backend-api/openapi.json` vs `api-client/openapi/openapi.json`.
- [ ] **Step 5: Commit.** `chore(api-client): regenerate types for board/capacity/kpis/events/aggregate`

---

## PHASE 2 — Teamlead cockpit wiring

### Task 2.1: API client + session + QueryClient

**Files:** Create `data/api.ts`, `data/session.ts`, `data/queryClient.ts`; Modify `main.tsx`, `.env.example` (`VITE_API_BASE_URL`, dev `VITE_DEV_TOKEN`); add `@tanstack/react-query` dep

- [ ] **Step 1:** `api.ts` exports `api = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL, token: getToken() })`.
- [ ] **Step 2:** `session.ts` — `getToken()` reads `VITE_DEV_TOKEN` in dev (later OIDC). `CURRENT_TEAMLEAD_ID` derives from the token, replacing the hardcoded `'tl-001'` in `store.tsx:34`.
- [ ] **Step 3:** `queryClient.ts` — `new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } } })`; wrap `<App/>` in `main.tsx`.
- [ ] **Step 4: Commit.** `chore(teamlead-web): api client + TanStack Query scaffold`

### Task 2.2: Remote dataset behind the existing selector seam

**Files:** Create `data/remoteDataset.ts`; Modify `data/store.tsx`

**Key idea:** keep the component-facing shapes (`CockpitSummary`, `BoardRow[]`, `recentOverrides`) UNCHANGED. The new endpoints already return board/capacity/kpis close to those projections — map directly rather than re-deriving via `buildCockpitSummary`.

- [ ] **Step 1: Failing test** (`remoteDataset.test.ts`, mock `api`): `fetchCockpit(date)` maps `capacity+dashboard+kpis+board+events` → `{ cockpit, board, lanes, recentOverrides }` with the same field names the components read.
- [ ] **Step 2: FAIL** → **Step 3: Implement** `Promise.all([api.GET('/api/teamlead/capacity'), api.GET('/api/teamlead/dashboard'), api.GET('/api/teamlead/kpis'), api.GET('/api/teamlead/board'), api.GET('/api/teamlead/events')])` → map: `cockpit.capacity` ← CapacityDto, `cockpit.pool` ← DashboardDto, `cockpit.zst` ← KpiDto, `board` ← BoardDto.rows, `recentOverrides` ← events.
- [ ] **Step 4: Rework `CockpitDataProvider`** to use `useQuery(['cockpit', date], () => fetchCockpit(date))` instead of `useState(loadMockDataset)`. Expose `{ data, isLoading, error }` through `useCockpitData`.
- [ ] **Step 5: PASS + typecheck.** **Step 6: Commit** `feat(teamlead-web): cockpit reads live backend data`.

### Task 2.3: Mutators → POSTs with optimistic UI

**Files:** `data/store.tsx`

- [ ] **Step 1:** `prioritiseCase(id, reason)` → `useMutation` POST `/api/teamlead/cases/:id/prioritize`, `onMutate` optimistic flag add, `onSettled` invalidate `['cockpit']`. Same for `parkCase`→`/park`, `releaseCase`→`/unpark`.
- [ ] **Step 2:** Disable/hide `withdrawCase`/`addCaseToBundle`/`reorderBundle`/`pauseBundle`/`commitSimulation` (no backend) behind a `MANUAL_OVERRIDES_ENABLED=false` flag with tooltip "kommt mit Manual-Override".
- [ ] **Step 3:** "Neu berechnen" → `useMutation` POST `/api/teamlead/assignments/recalculate` `{ date }`; on success snackbar with `RecalculateResultDto` (`bundleCount`, `assignedCaseCount`, `reserveMinutes`, `durationMs`) + invalidate `['cockpit']` so the board repopulates.
- [ ] **Step 4: Commit** `feat(teamlead-web): park/prioritize/recalculate hit the real API`.

### Task 2.4: Live SSE

**Files:** Create `data/useTeamleadStream.ts`; Modify `CockpitPage.tsx`

- [ ] **Step 1:** `new EventSource(`${baseUrl}/api/teamlead/stream`)` (token via query param or cookie); on `"case-status"` → `queryClient.invalidateQueries(['cockpit'])` (debounced 500ms).
- [ ] **Step 2: Commit** `feat(teamlead-web): live cockpit refresh via SSE`.

---

## PHASE 3 — Employee PWA wiring

### Task 3.1: API client + token (mirror 2.1)

**Files:** Create `apps/employee-pwa/src/data/api.ts`, `data/session.ts`; Modify `.env.example`

- [ ] Steps mirror Task 2.1 (no TanStack Query — Dexie live-queries stay). **Commit** `chore(employee-pwa): api client + session`.

### Task 3.2: `loadAssignedWork()` — fetch → Dexie

**Files:** Create `apps/employee-pwa/src/db/sync.ts`; Modify `db/seed.ts`, `App.tsx`

- [ ] **Step 1: Failing test** (`sync.test.ts`, mock `api`, fake-indexeddb): `loadAssignedWork()` calls `GET /api/me/today`, then `GET /api/me/cases/:id/aggregate` per case, writes `bundles` + `aggregates` to Dexie; `getActiveBundle()` then returns the fetched bundle mapped to `AssignedBundle` (`today.bundle` → `{ bundleId, employeeName, workstation, plannedStart, plannedEnd, estimatedMinutes, pickupStops }`).
- [ ] **Step 2: FAIL** → **Step 3: Implement** mappers (CurrentBundleDto.routeStops → PickupStop[]; CaseAggregateDto → CaseAggregate; init CaseProgress per case).
- [ ] **Step 4: Gate `seedIfEmpty`:** if `import.meta.env.VITE_API_BASE_URL` set, `App.tsx` calls `loadAssignedWork()`; else keep `seedIfEmpty()` (offline-demo fallback).
- [ ] **Step 5: PASS + typecheck.** **Step 6: Commit** `feat(employee-pwa): load assigned bundle from backend into Dexie`.

### Task 3.3: Completion/issue actions → backend

**Files:** `workflow/useCaseFlow.ts`

- [ ] **Step 1:** On `complete`/`partialComplete`/`reportIssue`, after the local Dexie write, POST the matching endpoint (`/api/cases/:id/complete | partial-complete`, `/api/issues`). The POST is the source of truth for ZST.
- [ ] **Step 2:** Reconcile `CaseProgress.version` with the backend `TransitionResultDto.version`.
- [ ] **Step 3: Commit** `feat(employee-pwa): completion + issue actions persist to backend`.

---

## PHASE 4 — UX improvements ("implement nicely")

### Task 4.1: The Start buttons mean something

**Files:** `employee-pwa/src/screens/TagesstartScreen.tsx`, `teamlead-web/src/features/cockpit/CockpitPage.tsx`

- [ ] **Step 1 (employee):** "Starten" — if no active bundle, label becomes **"Heute keine Zuteilung"** (disabled) with an explanation; if a bundle exists, show `{bundleId} · {caseCount} Belege · ~{minutes} min` and tap navigates into the first task. Skeleton while `loadAssignedWork()` runs.
- [ ] **Step 2 (teamlead):** rename "Starterpakete" → **"Zum Board"** (it only navigates) so the label stops implying it assigns. Make **"Neu berechnen"** the primary action with spinner + result snackbar (Task 2.3).
- [ ] **Step 3: Commit** `feat(ux): honest start/recalculate affordances`.

### Task 4.2: Loading / empty / error states everywhere

**Files:** `CockpitPage.tsx`, board/list pages, `TagesstartScreen.tsx`

- [ ] **Step 1:** MUI `Skeleton` for KPI tiles + board rows while `isLoading`; empty state for empty pool ("Pool leer – nichts zu verteilen"); error state with a Retry button on query error.
- [ ] **Step 2:** Make "ZST-Fortschritt" tiles visibly live (now from `/kpis`); add an "aktualisiert vor Xs" caption fed by SSE.
- [ ] **Step 3: Commit** `feat(ux): loading/empty/error states for live data`.

### Task 4.3: Fix the dead document links

**Files:** `teamlead-web/src/features/belege/BelegDetailPage.tsx`

- [ ] **Step 1:** The "Originaldokumente" links point at `#/preview/doc-01` placeholders. Disable them with a tooltip "Dokumentvorschau folgt (EPIC 3)" instead of a dead anchor.
- [ ] **Step 2: Commit** `fix(ux): disable dead Originaldokumente links`.

### Task 4.4: Optimistic feedback on overrides

**Files:** `store.tsx`, board components

- [ ] **Step 1:** park/prioritize show an immediate chip change + toast, roll back on POST failure (TanStack `onError` restores cache). The new audit line appears at the top of "Letzte Teamlead-Eingriffe" from the live `/events` feed.
- [ ] **Step 2: Commit** `feat(ux): optimistic override feedback with rollback`.

---

## PHASE 5 — Verification & CI

### Task 5.1: End-to-end happy path against the real backend

**Files:** `apps/teamlead-web/e2e/*`, `apps/employee-pwa/e2e/*`, `.github/workflows/ci.yml`

- [ ] **Step 1:** Playwright: seed → teamlead "Neu berechnen" → board shows bundles → employee "Starten" → completes a case → cockpit ZST tile increments (via SSE/refetch). Against a docker-compose backend.
- [ ] **Step 2:** Add CI jobs `integration` (`pnpm --filter @paket/backend-api test:int`) and `e2e` (Playwright with services). Wire the OpenAPI drift guard from Task 1.6.
- [ ] **Step 3: Commit** `test(e2e): live automatik happy path + CI integration/e2e jobs`.

---

## Sequencing & Risks

**Critical path:** Phase 0 → Phase 1 (endpoints) → Task 1.6 (regen) → Phases 2 & 3 (parallelizable: cockpit and PWA are independent once the client is regenerated) → Phase 4 (UX) → Phase 5 (verify).

**Risks**
- **Auth friction (highest):** no IdP locally → dev RS256 path (Task 0.2). Production OIDC is separate; do NOT block on it.
- **DTO shape drift:** the cockpit's `CapacitySummary`/`PoolSummary` live only in teamlead-web. New backend DTOs match those field names so the selector seam is untouched; promoting them into `domain-types` is a later cleanup.
- **ZST tiles change values:** moving 88/21/22/5.25 from constants to computed `/kpis` means demo numbers will differ from the current screenshot. Correct and expected — flag to the user.
- **Manual bundle edits have no backend:** explicitly out of scope; gated off, not faked.
- **Seed realism:** engine output depends on seeded cases/shifts/locations; keep the seed close to `mock.ts` so the demo stays recognizable.

## Definition of Done
- [ ] Teamlead presses *Neu berechnen* → real `assignWork` runs → board populates with persisted bundles + audit events.
- [ ] Employee presses *Starten* → works the backend-assigned package; completion writes a `ZstRecord`.
- [ ] All KPI tiles (incl. ZST) reflect live backend state; capacity/pool/audit update on action via SSE.
- [ ] No dead-end buttons or links; loading/empty/error states present.
- [ ] `typecheck` + `lint` (0 errors) + unit + integration (Testcontainers) + Playwright E2E green; CI runs all of them.
- [ ] `@paket/api-client` is actually consumed by both apps; mock datasets retained only as an explicit offline-demo fallback.
