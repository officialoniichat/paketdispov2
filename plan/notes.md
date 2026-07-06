# Investigation notes — Dev/Szenarien tab + ScenarioService + time-override

Repo: `/Users/moritzklemer/.cline/worktrees/04c86/paketlagerdispov2` (all paths below relative to repo root).
Written for the implementation agents of: dev-gated "Dev / Szenarien" Admin tab (teamlead-web),
backend ScenarioService (`POST /api/dev/scenarios/:key/load`, `GET /api/dev/scenarios`,
`POST/DELETE /api/dev/time-override`), scenario library B1–B15, int smoke tests via exported `loadScenario(key)`.

> NOTE: `apps/backend-api/prisma/seed.ts` currently contains **live cherry-pick conflict markers**
> (2× `<<<<<<<` as of this scan; `seed-data.ts` clean). Another agent is resolving them. Both sides are
> documented in §4 — do not "fix" the markers yourself; re-read the file at implementation time.

---

## 1. Backend structure

### 1.1 Module layout — `apps/backend-api/src/`
Feature modules live as **top-level dirs** (NOT under `src/modules/`):
`admin/ assignment/ auth/ cases/ config/ employees/ events/ health/ integration/ live/ observability/ openapi/ prisma/ prohandel/ workflow/` plus `app.module.ts`, `main.ts`, `config.ts`, `swagger.ts`.
`src/modules/` exists but contains **pure event-draft domain cores** (completion, issue, print, reporting, transport — EPIC-5 legacy layout), not NestJS modules. `src/integration/` holds the `*.int.test.ts` integration tests (§8).

### 1.2 Registering a new module — `src/app.module.ts` (whole file is ~35 lines)
```ts
@Module({
  imports: [PrismaModule, EventsModule, AuthModule, LiveModule, WorkflowModule,
            CasesModule, AdminModule, EmployeesModule, ProhandelModule, HealthModule],
})
export class AppModule {}
```
→ A new `DevModule` (e.g. `src/dev/dev.module.ts` with `DevController` + `ScenarioService`) is added to this imports array. Each module follows the 4-file pattern (see `src/admin/`): `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`.

### 1.3 Auth/RBAC guard pattern
- `src/auth/auth.module.ts:42` registers **global guards** via `APP_GUARD`: `JwtAuthGuard` (token verification) then `RolesGuard`.
- `src/auth/rbac.ts:67`: `export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);` — `Role` enum has `Admin`, `Teamlead`, `Employee`.
- `src/auth/guards.ts:68-95` `RolesGuard.canActivate`: `@Public` bypass; **no `@Roles` metadata ⇒ auth-only**; else `hasAnyRole(principal, required)` → 403.
- Controller-level usage (copy this): `src/admin/admin.controller.ts:23-24`
  ```ts
  @Roles(Role.Admin, Role.Teamlead)
  @Controller('api/admin')
  ```
  There is **no global URL prefix** (`main.ts` has no `setGlobalPrefix`); controllers bake `api/...` into `@Controller()`. So the dev controller is `@Controller('api/dev')`.
- Roles come from token claims (`src/auth/token-verifier.ts:27,72`, claim paths configurable via `OIDC_ROLE_CLAIM_PATHS`, `src/config.ts:44-47`).

### 1.4 Existing admin endpoints — `src/admin/admin.controller.ts`
`@Controller('api/admin')`, `@Roles(Admin, Teamlead)`:
- `GET/PUT locations` (lines 28/35), `GET/PUT rules` (48/55) — RuleConfig roundtrip
- `GET catalogs/wgr` (64), `GET catalogs/inspection-levels` (71)
- `GET online-size-preferences` (80), `POST online-size-preferences/upload` (87) — CSV body `{ csv: string }`
Other controllers: `api/teamlead` (`src/cases/teamlead.controller.ts`), `api/me` (`src/cases/me.controller.ts`), `api` (`src/cases/cases.controller.ts`, `src/live/live.module.ts`), `api/admin/employees` (`src/employees/employees.controller.ts`), `api/admin/integrations/prohandel` (`src/prohandel/prohandel.controller.ts`), `static/pictograms` (`src/prohandel/pictograms.controller.ts`).

### 1.5 Config service / env vars — `src/config.ts`
Single frozen `export const config = {...} as const` object built from `process.env` with `num()/bool()/list()` helpers + `dotenv/config` import. No Nest `ConfigModule`. Keys: `env` (`NODE_ENV`, default `'development'`), `host/port` (`PORT`/`API_PORT`, default 3000), `databaseUrl`, `otel.*`, `auth.*` (OIDC + `AUTH_DEV_PUBLIC_KEY` dev key), `swagger.enabled/path` (`SWAGGER_ENABLED` default true).
→ **Dev-gating pattern**: add e.g. `dev: { scenariosEnabled: bool(process.env.DEV_SCENARIOS_ENABLED, config.env !== 'production') }` here; precedent for env-dependent behavior exists (`config.env`, swagger toggle).

### 1.6 OpenAPI generation → api-client (DB-less recipe, verified)
- Generator: `src/openapi/generate.ts` — `NestFactory.create(AppModule, FastifyAdapter, { preview: true, logger: false })` = **Nest preview mode, scans decorators, never connects Prisma**; writes to `apps/backend-api/openapi.json` via `buildOpenApiDocument` from `src/swagger.ts`.
- Commands (in order):
  1. `pnpm --filter @paket/backend-api build` (script: `pnpm --filter "@paket/backend-api^..." build && prisma generate && tsc -p tsconfig.json`)
  2. `pnpm --filter @paket/backend-api openapi:generate` (= `node dist/openapi/generate.js`)
  3. copy `apps/backend-api/openapi.json` → `packages/api-client/openapi/openapi.json`
  4. `pnpm --filter @paket/api-client generate` (= `openapi-typescript ./openapi/openapi.json -o ./src/generated/schema.ts`)
  5. `pnpm --filter @paket/api-client build`
- Gotcha (project memory): stale api-client tsbuildinfo + cross-worktree `node_modules/@paket/*` symlinks can hide regenerated types — if teamlead-web doesn't see new endpoints, verify `apps/teamlead-web/node_modules/@paket/api-client` resolves into THIS worktree and rebuild the package dist.

---

## 2. Time / `now` plumbing

### 2.1 Injectable `now` already exists (assignment only)
`src/assignment/assignment.service.ts`:
- `async recalculate(principal, date?, now: Date = new Date())` — lines 76-78. Uses `now` for: default `day` (`now.toISOString().slice(0,10)`) and the engine call, line 155: `assignWork(input, engineConfig, { now: now.toISOString() })` (Schichtende-Cutoff evaluation).
- `async assignNextBundle(principal, date?, now: Date = new Date())` — lines 186-188. `now` drives day default + finishable budget (`shift_ending` returns at lines 257/321).
- Engine side: `packages/assignment-engine/src/assignment/plan.ts:105` `const now = options.now ?? new Date().toISOString();`.

**Call sites currently pass NO now** (system clock wins):
- `src/cases/teamlead.controller.ts:305-314` → `POST /api/teamlead/assignments/recalculate` → `this.assignment.recalculate(principal, dto.date)`.
- `src/cases/me.controller.ts:58` → `this.assignment.assignNextBundle(principal)`.

### 2.2 Other system-clock reads in the request path (would need the override)
- `src/cases/teamlead-read.service.ts:358` `async dashboard(now: Date = new Date())` — injectable, but controller calls `this.read.dashboard()` with no arg (`teamlead.controller.ts:54-57`). `now` feeds `endOfShiftOpenCount` (line 384: `countEndOfShiftOpen(now)`).
- `src/cases/teamlead.controller.ts:64/71/78` — board/capacity/kpis default the **date** param: `date ?? new Date().toISOString().slice(0,10)`.
- `src/cases/cases.service.ts:64` (`const now = new Date()`), `:467 completedAt: new Date()`, `:691 at: new Date().toISOString()`.
- `src/cases/teamlead.service.ts:143, 604, 719 (now: Date = new Date() param), 980`.
- `src/employees/employees.service.ts:425` (today-ISO helper).
- `src/prohandel/prohandel.service.ts:26` `pull(principal, now: Date = new Date())` — injectable, controller passes nothing.
- `src/assignment/assignment.service.ts:407` `preview(...)` uses `new Date()` directly (NOT injectable yet).
- Seed: `prisma/seed.ts` `SEED_DATE = new Date().toISOString().slice(0,10)` (targets "today").

### 2.3 What a persisted server-side time override needs
Recommended: a small injectable clock helper (mirroring `loadRuleConfig`, §3) that reads an AppConfig row (key e.g. `dev_time_override`, value `{ nowIso }`) and falls back to `new Date()`. Then:
1. Thread it into the **already-defaulted `now` params**: `recalculate`, `assignNextBundle`, `dashboard`, `teamlead.service.ts:719`, `prohandel.pull` — resolve in controllers or replace `= new Date()` defaults with clock lookups.
2. Replace the raw date defaults in `teamlead.controller.ts:64/71/78` and `assignment.service.preview:407`.
3. `cases.service.ts` persistence timestamps (`completedAt`, event `at`) — decide whether the override skews persisted timestamps too, or only planning "today/now" (planning-only is the smaller, safer surface for scenarios).
AppConfig read is async → clock lookup must be awaited per request (single PK read; caching + invalidation by the dev endpoints is possible since these are dev-only).

---

## 3. RuleConfig / settings storage — the pattern to reuse

- Prisma model `AppConfig` — `apps/backend-api/prisma/schema.prisma:553-559`:
  ```prisma
  model AppConfig {
    key       String   @id
    value     Json
    updatedAt DateTime @updatedAt
    @@map("app_config")
  }
  ```
  Generic key→JSON singleton store ("Singleton structured-config store (§11)"). No migration needed for new keys.
- Read pattern: `src/config/rule-config.ts` — `loadRuleConfig(prisma)`: `prisma.appConfig.findUnique({ where: { key: RULE_CONFIG_KEY } })` → `ruleConfigSchema.safeParse(row?.value)` → fallback `DEFAULT_RULE_CONFIG`. Schema + key constant in `packages/domain-types/src/admin-config.ts` (`ruleConfigSchema` :186-194, sections `priority|bundle|effort|grouping|shiftEnd|inspection|loadPlan`; `RULE_CONFIG_KEY = 'rule_config'` :198; `DEFAULT_RULE_CONFIG` :205).
- Write pattern: `PUT /api/admin/rules` in `src/admin/admin.service.ts` (Zod-validated at boundary, upsert on key).
→ **Reuse for dev state**: new keys e.g. `dev_time_override` and `dev_current_scenario`, Zod schemas in domain-types, same `appConfig.upsert/findUnique/delete` calls. `DELETE /api/dev/time-override` = delete the row.

---

## 4. Existing reset / seed / mock-ERP

### 4.1 `apps/backend-api/prisma/seed.ts` (~1055 lines, **conflict markers live in import block**)
- Entry point: `apps/backend-api/package.json:9` → `"seed": "node --import @swc-node/register/esm-register prisma/seed.ts"`. Run: `pnpm --filter @paket/backend-api seed` (header also mentions `pnpm --filter @paket/backend-api exec prisma db seed`; `prisma.config.ts` only sets schema path + loads root `.env` for DATABASE_URL). `SEED_SCENARIO=typical|peak` env selects volume.
- Structure: idempotent upserts by natural keys (employeeNo, role name, location code, weBelegNo, [employeeId,date]) for master data; **transactional case graph is WIPED and rebuilt** by `resetCaseGraph()` (seed.ts:86-94):
  ```ts
  await prisma.zstRecord.deleteMany({});
  await prisma.assignmentItem.deleteMany({});
  await prisma.goodsReceiptCase.updateMany({ data: { assignedBundleId: null } });
  await prisma.assignmentBundle.deleteMany({});
  await prisma.goodsReceiptCase.deleteMany({});   // cascades positions/skuLines/boxes/issues/workInstruction
  ```
  → This is the reset primitive `ScenarioService.loadScenario(key)` should reuse/extract. Master data (roles, users, locations, rule config) is upserted, never wiped.
- `SEED_DATE = new Date().toISOString().slice(0,10)`; helpers `asDate(day)`, `asTime(day,'HH:mm')`, `offsetDate(n)`, `requireId(map,key,kind)`.
- **Conflict**: HEAD side imports `generateBelege`/`persistGeneratedBeleg` from `../src/prohandel/` (mock-ERP-complete Belege) + `DEFAULT_INSPECTION_LEVELS`/`DEFAULT_WGR_CATALOG`; incoming side (`a90ea09`) imports `LOCATIONS, SCENARIO_TARGET, USERS, generateReadyCases, resolveScenario` from `./seed-data.js`. Expect resolution to combine deterministic volume (seed-data) with the ERP generator (prohandel). Re-read after the other agent lands.
- `prisma/seed-data.ts` (clean): `SeedScenario = 'typical' | 'peak'` (:18), `resolveScenario(raw)` (:21), `SCENARIO_TARGET = { typical: 171, peak: 315 }` (:26), `USERS` (:107), `LOCATIONS` (:138), `GeneratedCase` (:165), `generateReadyCases(scenario)` (:229) — fully deterministic, derived from `docs/data/belege-history-per-day.csv`.

### 4.2 Mock-ProHandel pull
- Endpoint: `POST /api/admin/integrations/prohandel/pull` — `src/prohandel/prohandel.controller.ts:15,19`, `@Roles(Admin, Teamlead)`.
- Service: `ProhandelService.pull(principal, now: Date = new Date())` — `src/prohandel/prohandel.service.ts:26`. Deterministic: derives next WE-number cursor from max existing `weBelegNo`, calls `generateBelege({ seed: startNo, count: PULL_BATCH_SIZE(=8), startNo, bookingDate: day, storageCodes })` (`src/prohandel/beleg-generator.ts`), persists via shared sink `persistGeneratedBeleg` (`src/prohandel/beleg-persist.ts`) — incomplete bookings land as `blocked` (Intake-Gate D1). Returns `{ pulledCases, blockedCases, weBelegNos, date }`.
- `generateBelege` + `persistGeneratedBeleg` are the building blocks for scenario Belege with full ERP fields (prices, WGR, CatMan, Sicherungstyp, Prüfstufe, cartons, shop/Filiale, delivery groups).

### 4.3 Materialize shifts
- Private: `AssignmentService.materializeShiftsForDate(dayIso, dayDate)` — `src/assignment/assignment.service.ts:358-397`; called from `recalculate` (:90) and `assignNextBundle` (:224). Derives concrete `Shift` rows (source `'pattern'`) from each active user's `weeklyPattern`, applying `productivityFactor` × `partTimePct`; upsert by `shift_employee_date`.
- **KNOWN BUG / test rot (project memory)**: for an active user whose pattern says non-working it does `shift.deleteMany({ employeeId, date })` — deletes manually created shifts of pattern-less employees (temp workers); behind the red int-test baseline. Scenario seeds MUST give users a full `weeklyPattern` (see §8 `WEEK_PATTERN`).

### 4.4 Recalculate endpoint
`POST /api/teamlead/assignments/recalculate` (`src/cases/teamlead.controller.ts:305`) → `AssignmentService.recalculate`. Idempotent: one transaction clears the prior plan for the date (only reverts `assigned` cases; in-flight statuses untouched), re-reads pool, runs engine, persists. `POST assignments/preview` (:317) — same engine, persists nothing.

---

## 5. Scenario-relevant domain features (real code)

### 5.1 Delivery-group detection + pool-hold + TL release
- Detection: `packages/assignment-engine/src/grouping/delivery-group.ts` — tiered pure Union-Find: T1 `deliverySourceGroupKey` ("Lieferschein X von N") → confirmed; T2 identical `deliveryNoteNo` → likely; T3 consecutive `weBelegNo` run (`maxWeBelegGap`, hardened by `runRequiresSameDay`/`runRequiresSameSection`) → suspected; `manualDeliveryGroupKey` → locked. `GroupingConfig` :23-41; engine default `autoDistributeSuspected: true`, production `DEFAULT_RULE_CONFIG` overrides to `false`.
- Pool-hold: `withheldCaseIds(groups, config)` (delivery-group.ts:330) → `plan.ts:166-179` marks members unassigned with reason `'delivery_unconfirmed'` (types.ts:90).
- Case fields (schema.prisma GoodsReceiptCase, :334-400): `deliveryNoteNo`, `deliverySourceGroupKey`, `deliverySourceGroupSize`, `manualDeliveryGroupKey`, `deliveryGroupReleased Boolean @default(false)` ("Lieferungs-Pool-Hold (D2): TL-Freigabe 'trotzdem bearbeiten'").
- TL endpoints (`src/cases/teamlead.controller.ts`): `POST delivery-groups/merge` (:122), `POST delivery-groups/release` (:132 → `teamlead.service.ts:512 releaseDeliveryGroup`), `POST delivery-groups/split` (:219).

### 5.2 Intake data-quality gate ("zurück an Bucher")
- `CaseStatus.blocked` (schema.prisma:18-21: "Intake-Gate (D1): Pflichtdaten fehlen -> 'zurueck an Bucher', nie im Pool") + `missingFields String[] @default([])`; `storageLocationId` optional ONLY for blocked cases (plan-/verteilbare Belege always have one).
- Blocked cases are created by `persistGeneratedBeleg` when mandatory data is missing.
- TL flow: `POST /api/teamlead/cases/:caseId/return-to-bucher` (controller :145 → `teamlead.service.ts:298 returnToBucher` — requires status `blocked`, appends `case.returned_to_bucher` event with `missingFields` + note; mock queue, no ProHandel write, status unchanged) and `POST cases/:caseId/complete-intake` (:158 → `:334 completeIntake` — fills `storageLocationId`/`deliveryNoteNo`; all mandatory fields present ⇒ `blocked → ready`, back into pool).

### 5.3 Teile threshold + manual TL decision (Monster-/Groß-Belege)
- Config: `largeBelegTeileThreshold` — engine `packages/assignment-engine/src/config.ts:63,72` (default 2000); RuleConfig `bundle.largeBelegTeileThreshold` (domain-types/admin-config.ts:45,216; Admin "Bündel" tab label "Monster-Beleg-Schwelle (Teile)").
- Engine: `plan.ts:183-193` — `teile >= threshold` ⇒ NOT auto-distributed; `unassigned` reason `'large_beleg'` → waits in pool for **manual TL decision** (manual assign: `POST /api/teamlead/employees/:employeeNo/assign`, controller :366).
- Continuation (C6): `assignment.service.ts:103-117` — employees on a `partially_completed` case ≥ threshold get NO new starter pack (their shift is withheld from distribution); `assignNextBundle` ~:210-220 blocks self-pull the same way.

### 5.4 NOS tier + priority-ladder ranks (actual engine order)
`packages/assignment-engine/src/types.ts:17-28`:
```ts
export const PRIORITY_RANK = {
  exclusion: 0,        // excluded
  manualTeamlead: 1,   // manual TL priority
  prioFlag: 2,         // Prio-Kennzeichen
  dailyLoading: 3,     // TIER 1: Jeden-Tag-Abschnitte 7/4/8 + tägliche Shopbereiche (120/90)
  nosHaengeware: 4,    // TIER 2: NOS + Hängeware
  loadPlanDue: 5,      // TIER 3: Verladeplan-Abschnitte 1/2/3, fällig ab Verladetag (kein Vorlauf)
  fifo: 6,
} as const;
```
Classification in `src/priority/priority-engine.ts:60-134` (classes `exclusion|manual_teamlead|prio_flag|daily_loading|nos_haengeware|load_plan_due|fifo`); NOS via goodsTypeText NOS/NOS-Nachorder (`isNosCase`), Hängeware via Hängebahn Bereich; loadPlanDue requires section ∈ {1,2,3} AND `today >= loadPlanDate` (overdue when `>`). Sort = rank, then FIFO oldest bookingDate (:137-141).

### 5.5 Shift-end cutoff + `shift_ending` pull reason
- Pure helpers: `packages/assignment-engine/src/capacity/shift-end.ts` — `minutesUntilShiftEnd`, `autoAssignableCapacityMinutes` (proportional wall-clock model; `autoCutoffMinutes=0` engine default = no-op), `finishableBudgetMinutes`. Config `shiftEndRuleConfigSchema` (domain-types/admin-config.ts:86; app default cutoff 120). Admin tab index `SHIFT_END_TAB = 9`.
- Applied: `plan.ts:114-127` (cutoff-effective shifts for batch distribution). Self-pull: `assignment.service.ts:257` and `:321` return `{ assigned: false, reason: 'shift_ending' }`. Reason enum documented `src/assignment/assignment.dto.ts:14`: `no_shift|active_bundle|capacity_done|shift_ending|pool_empty` (+ `skill_tier` at service :204).

### 5.6 specialDay Verladeplan + resolveLoadPlanDate
- `src/assignment/load-plan.ts` — `resolveLoadPlanDate(goodsCase, rows, today)` (:69+): matches `primaryShopAreaNo`/`primaryFloor` against active `RuleConfig.loadPlan` rows; earliest weekday occurrence anchored on/after bookingDate (missed day stays past ⇒ overdue). **`specialDay: true` row = one-off loading date (its `validFrom` IS the day) and SUPPRESSES regular weekday candidates inside its [validFrom, validTo] window** (:59-66, `suppressedBySpecial` :79-81). `applyResolvedLoadPlanDates` wired in recalculate (assignment.service ~:143). Row schema `loadPlanRowSchema` domain-types/admin-config.ts:174-184 (`specialDay` :181). Prisma `LoadPlanRule` table is **DEAD** — RuleConfig.loadPlan is the only live source.

### 5.7 Skill tiers + gating + "Koffer"
- Prisma `enum SkillTier { profi fortgeschritten basis starter dummy }` (schema.prisma:174-180); on `User.skillTier`.
- Gate const: `packages/domain-types/src/enums.ts:51-55` `AUTO_ASSIGNABLE_SKILL_TIERS = ['profi','fortgeschritten','basis']`.
- Auto-distribution gate: `plan.ts:107-113` filters shifts by tier (`shift.skillTier ?? 'profi'` — absent = profi). Self-pull gate: `assignment.service.ts:202-205` starter/dummy → `{ assigned:false, reason:'skill_tier' }`.
- **"Koffer" is NOT a LocationKind.** `enum LocationKind { regal palette_a palette_b palette_c palette_e haengebahn lagerplatz_d workstation printer conveyor_packages conveyor_finished_goods }` (schema.prisma:57-69). Only Koffer reference: WGR catalog `{ wgr: '812770', description: 'Koffer/Reisegepäck' }` (`packages/domain-types/src/erp-catalog.ts:29`). Scenario specs mentioning "Koffer" must map to a WGR, not a Lagerklasse.

### 5.8 Online-size preference CSV
- Model `OnlineSizePreference` (schema.prisma:507-516): `wgr, sizeVariant, preferredSize, alternativeSize?`, unique `[wgr, sizeVariant]` (name `online_size_wgr_variant`).
- Endpoints: `GET /api/admin/online-size-preferences` (admin.controller.ts:80), `POST /api/admin/online-size-preferences/upload` (:87) — JSON body `{ csv }`, semicolon-separated with header `wgr;sizeVariant;preferredSize;alternativeSize`, per-line Zod validation, upsert by natural key (`admin.service.ts:187-210 uploadOnlineSizePreferences`).
- **No sample CSV fixture file exists in the repo** (searched `*online*size*` outside node_modules — only code + diagrams). A scenario needing preferences must synthesize rows.

### 5.9 Issue / parked / forwarded / Teilabschluss states
- `enum CaseStatus`: `needs_review, blocked, ready, parked, assigned, in_progress, issue_open, partially_completed, completed, zst_done, cancelled` (schema.prisma:18-31).
- Forwarding (Digitale Ablage C5): `GoodsReceiptCase.forwardedTo String?`; catalog `forwardRecipientSchema = z.enum(['retourenabteilung','lieferscheinbucher'])` (`packages/domain-types/src/enums.ts:214-216`). Endpoints `POST cases/:caseId/forward` (:195) / `unforward` (:209) → `teamlead.service.ts:455/464`.
- Park: `POST cases/:caseId/park` (:229) / `unpark` (:239); employee-side `parkRemaining` (`cases.service.ts:185`).
- Issues: `Issue` model + `enum IssueStatus { open in_review waiting_external resolved rejected }`, `IssueScope`, `IssueType` (schema.prisma:92-120); TL `POST cases/:caseId/resolve-issue` (:292).
- TL-Topf: `attentionFlag/attentionNote` + `flag-attention` (:171) / `unflag-attention` (:185). Archiv: `docuWareUrl`, `completedAt`. ZST: `POST assignments/export-zst` (:330), `ZstRecord` model. Also `prioritize/deprioritize/approve/reactivate/cancel`, `bundles/:id/withdraw|add|reorder|pause|resume` — see full endpoint list `teamlead.controller.ts:54-402`.

### 5.10 partially_completed carryover / Folgetag
- Employee partial close leaves case `partially_completed`; bundle auto-closes once nothing open remains (`cases.service.ts:411, 441, 532` — "§continuation").
- Next-day recalculate: `assignment.service.ts:103-117` withholds the continuing employee's shift while a large `partially_completed` case is open on their bundle (§5.3). Engine `plan.ts` ~:199: "Starter-Packs (C1/C3): Fortsetzungen aus Vortagen zuerst, dann der heutige Pool" — continuations placed first in prio/FIFO order.
- `clearPriorPlanForDate` only reverts `assigned` cases ⇒ in-flight/partial cases survive recalculate (multi-day scenarios work by flipping the date/now and re-running recalculate).

---

## 6. teamlead-web

### 6.1 AdminPage tab structure
- File: `apps/teamlead-web/src/features/admin/AdminPage.tsx` (649 lines). Sibling tab components in the same dir: `VerladeplanTab.tsx`, `SchichtplanTab.tsx`, `IntegrationenTab.tsx`, `EmployeeSettings.tsx`, `LocationMasterEditor.tsx`, `EffortPreview.tsx`, `EmployeeDetailPanel.tsx`.
- Tabs = **string array + positional index constants** (AdminPage.tsx:37-62):
  ```ts
  const TABS = ['Priorität','Bündel','Aufwand','Lieferungen','Verladeplan', /* Lagerplätze, Mitarbeiter, Schichtplan, Integrationen, Schichtende(+Aufwand-Vorschau?) */];
  const GROUPING_TAB = 3; const LOADPLAN_TAB = 4; const LOCATIONS_TAB = 5;
  const EMPLOYEES_TAB = 6; const SCHICHTPLAN_TAB = 7; const INTEGRATIONS_TAB = 8; const SHIFT_END_TAB = 9;
  ```
  Rendering (:111-125): `<Tabs value={tab} onChange={(_,v)=>setTab(v)} variant="scrollable">{TABS.map(t => <Tab key={t} label={t}/>)}</Tabs>` then an if/else chain: `tab === INTEGRATIONS_TAB ? <IntegrationenTab/> : tab === SCHICHTPLAN_TAB ? <SchichtplanTab/> : … : (inline RuleConfig form)`.
- **To add "Dev / Szenarien"**: append the label to `TABS` (indices are positional — append at END; if the tab is conditional on the dev flag, compute its index from `TABS.length` after the conditional push, don't hardcode) + a `<DevScenariosTab/>` branch. `IntegrationenTab.tsx` (mock-ProHandel "Jetzt pullen" action UI) is the closest template for an action-button tab.
- Data layer: TanStack Query — `useQuery({queryKey:['admin','rules'], queryFn: fetchRuleConfig})` + `useMutation(saveRuleConfig)` (AdminPage.tsx:76-105); fetchers in `src/data/admin.ts` (:71 `fetchRuleConfig`, :83 `saveRuleConfig`) calling the typed `api` client.

### 6.2 Env access
- `src/config/runtimeEnv.ts` — `resolveEnv(key)`: runtime `window.__ENV__[key]` (from `/env.js`, written at container start by `scripts/write-runtime-env.mjs`, loaded before the bundle) → `import.meta.env[key]` → undefined; blank = unset.
- Usage: `src/data/api.ts:18-24`: `baseUrl = resolveEnv('VITE_API_BASE_URL') ?? 'http://localhost:3000'` (trailing slash stripped), `token = resolveEnv('VITE_DEV_TOKEN')`, `export const api = createApiClient({ baseUrl, token })` (openapi-fetch from `@paket/api-client`). `CURRENT_TEAMLEAD_ID` derived from token.
- **Dev-gating precedent**: employee-pwa's `resolveEnv('VITE_DEMO_CONTROLS') === '1'` (§7). teamlead-web has **no existing `import.meta.env.DEV/PROD/MODE` usage and no dev-only exclusions** — recommended gate: a `VITE_*` flag via `resolveEnv` (runtime-overridable, consistent with PWA), optionally OR'd with `import.meta.env.DEV`.

### 6.3 Toast/snackbar pattern
MUI `<Snackbar>` + `<Alert severity="error" variant="filled">` inline per feature — canonical example `src/features/board/MitarbeiterBoard.tsx:92-101` (tracks a `failed` mutation, `autoHideDuration={8000}`, `anchorOrigin={{vertical:'bottom',horizontal:'center'}}`, `failed?.reset()` on close). Mutation errors are typed `MutationError` thrown from `src/data/mutations.ts:22-42`. **No global toast provider** — copy the local Snackbar pattern.

### 6.4 Build
- `apps/teamlead-web/package.json`: `dev` = `vite --port 5174`, `build` = `pnpm --filter "@paket/teamlead-web^..." build && vite build`, `start:prod` = `node scripts/write-runtime-env.mjs && vite preview --port 5174`, plus `typecheck/lint/test/e2e`.
- `vite.config.ts`: react plugin only; `server/preview: { host: true, allowedHosts: true }`. **No `define` flags, no conditional chunks** — nothing is currently excluded from prod bundles; a dev tab ships in the bundle and must be gated at runtime (env flag) AND server-side (backend refuses dev endpoints when disabled).

---

## 7. employee-pwa demo scenarios (prior art for a scenario library)

- `apps/employee-pwa/src/db/seed.ts` — `seedScenario(scenarioId, db)` (:40) writes `{bundle, collectStops, belege, aggregates}` from `getScenario(id).build()` into Dexie; `seedIfEmpty` (:54); `resetToScenario(id)` (:74) clears ALL Dexie tables then reseeds; `cycleDemoScenario` (:66) round-robins. Selected id persisted in `localStorage['paket.demo.scenario']` (:20).
- Scenario registry: `src/demo/scenarios.ts` (`DEFAULT_SCENARIO_ID`, `DEMO_SCENARIOS`, `getScenario` — each scenario has `id`, `label`, `build()`), good shape template for the backend scenario library (B1–B15: `{ key, label, description, load(prisma/ctx) }`).
- Gating (`src/data/api.ts`): `isBackendEnabled = Boolean(apiBaseUrl)` (:23), `demoControlsEnabled = resolveEnv('VITE_DEMO_CONTROLS') === '1'` (:30). UI: `src/screens/BundleHomeScreen.tsx:171` `{!isBackendEnabled && demoControlsEnabled ? <DemoControls/> : null}` — offline mode AND explicit flag. Component: `src/components/DemoControls.tsx`.

---

## 8. Integration tests

- Config: `apps/backend-api/vitest.integration.config.ts` — include `src/**/*.int.test.ts`, `testTimeout 120_000`, `hookTimeout 180_000`, `fileParallelism: false`, `pool: 'forks'`. Run: `pnpm --filter @paket/backend-api test:int` (Docker required). Unit run (`pnpm --filter @paket/backend-api test` = plain `vitest run`) excludes int tests via the separate config.
- Tests: `src/integration/*.int.test.ts` (17 files: board, admin, recalculate-idempotent, me-next-bundle, lifecycle, effort-wiring, ablage-forwarding, belege-view, manual-overrides, preview, kpis, capacity, events, case-detail, case-lookup, me-aggregate, assign-to-employee). **No shared setup helper** — each file self-hosts. Canonical pattern (`src/integration/board.int.test.ts:1-60`):
  - `beforeAll`: `new PostgreSqlContainer(...)` (`@testcontainers/postgresql`), prisma migrations via `execSync` with `BACKEND_DIR = path.resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')` cwd + container DATABASE_URL, then `new PrismaClient()`.
  - Services constructed **directly, no Nest DI, no HTTP**: `new EventLogService(prisma)`, `new AssignmentService(prisma as PrismaService, events)`, `new TeamleadReadService(...)`.
  - Principal literal: `{ sub: 'oidc-tl-1', employeeNo: 'tl-001', roles: [Role.Teamlead], claims: {} }`.
  - Fixed `DATE = '2026-06-15'`; users seeded **WITH `weeklyPattern`** — `FULL_DAY = { working:true, start:'07:00', end:'15:00', breakMinutes:0, partTimePct:100 }` for all 7 days — REQUIRED because `materializeShiftsForDate` deletes shifts of pattern-less users (§4.3).
- → ScenarioService smoke test: same recipe; export `loadScenario(key)` (and the scenario registry) from the service module so tests import + call it directly, then assert case counts/statuses per scenario.
- **Known-red baseline**: `test:int` was **18/41 red pre-existing** (memory notes `materialize-shifts-deletes-manual-shifts`, Dustin-review R2). `pnpm test` green ≠ `test:int` green. Record the baseline before your change; only compare deltas.

---

## 9. Quality-gate commands

| Gate | Command | Notes |
|---|---|---|
| Typecheck | `pnpm typecheck` (root, turbo) | expected **13/13 green** (CLAUDE.md gate) |
| Engine tests | `pnpm --filter @paket/assignment-engine test` | vitest, ~125 tests |
| Backend unit tests | `pnpm --filter @paket/backend-api test` | excludes int tests |
| Int tests | `pnpm --filter @paket/backend-api test:int` | Docker/Testcontainers; known-red baseline (§8) |
| All unit tests | `pnpm test` (turbo, `dependsOn ^build`) | ~402 tests repo-wide |
| Lint | `pnpm lint` (turbo; per-pkg `eslint src`) | NestJS DI import-type lint warnings must NOT be auto-fixed |
| Build | `pnpm build` (turbo) | |
| OpenAPI regen | §1.6 five-step recipe | keep backend spec + `packages/api-client/openapi/openapi.json` consistent (part of standard gate) |
| DB / dev stack | `pnpm infra:up` (docker compose, infra only) · `pnpm db:migrate` · `pnpm --filter @paket/backend-api seed` · `pnpm dev:setup` (writes 3 gitignored `.env` + RS256 dev tokens, `apps/backend-api/scripts/dev-setup.mjs`) · `pnpm dev` (backend :3000, teamlead :5174, pwa :5175) | "Failed to fetch" cockpit = backend dev server down |
| Architecture diagrams | `cd docs/architecture && ./render.sh [basename]` (mermaid-cli via npx, renders `src/*.mmd` → `rendered/*.svg`) | **CLAUDE.md mandate**: new DevModule ⇒ update `docs/architecture/src/c3-backend-components.mmd` (+ `c2-container.mmd` if container surface changes) and commit re-rendered SVGs in the SAME change set |

Conventional Commits; base all work on `main`.

---

## 10. Implementation pointers (synthesis)

1. **DevModule**: `src/dev/{dev.module.ts,dev.controller.ts,scenario.service.ts,dev.dto.ts}`; register in `app.module.ts`. `@Controller('api/dev')` + `@Roles(Role.Admin)` (or Admin+Teamlead, matching admin). Gate the whole controller behind a `config.dev.*` flag (small guard or constructor check → 404/403 in prod) so prod stays safe even though routes exist.
2. **ScenarioService.loadScenario(key)**: reuse `resetCaseGraph()` (extract from `prisma/seed.ts` into a shared lib importable by both seed.ts and the service — coordinate with the in-flight seed conflict resolution), then build scenario Belege via `generateBelege`/`persistGeneratedBeleg` (§4.2) and/or `generateReadyCases` (§4.1); persist `dev_current_scenario` in AppConfig; optionally set the time override; optionally trigger `recalculate`.
3. **Time override**: AppConfig keys + clock threading per §2.3; `POST /api/dev/time-override { nowIso }`, `DELETE` removes the row; `GET /api/dev/scenarios` returns the registry + current key + active override.
4. **B1–B15 scenario knobs available in the domain**: blocked/missingFields (intake gate), delivery groups (source key / deliveryNoteNo / weBelegNo run + `deliveryGroupReleased`), Monster-Belege (≥2000 Teile), every prio rank (prio flags, sections 7/4/8 vs 1/2/3, shopAreas 120/90, NOS/Hängeware goodsTypeText, loadPlanDate), specialDay loadPlan rows, per-user `skillTier`, shifts via `weeklyPattern` (never bare Shift rows — §4.3 bug), statuses parked/issue_open/partially_completed/forwardedTo, OnlineSizePreference rows, attentionFlag/TL-Topf, catManDate (display-only since Pkt.7).
5. **Frontend**: `DevScenariosTab.tsx` in `src/features/admin/`, TABS entry appended + gated via `resolveEnv('VITE_DEV_TOOLS') === '1'`-style flag (beware positional index constants when conditional); local Snackbar for load/override feedback; TanStack `useMutation` on new api-client paths (regen §1.6, watch cross-worktree symlink gotcha).
