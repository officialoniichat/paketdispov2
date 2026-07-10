# Railway deployment runbook

This monorepo deploys **three services** to Railway, each with config-as-code:

| Service | `railway.json` | Build | Start |
| --- | --- | --- | --- |
| `backend-api` | `apps/backend-api/railway.json` | `pnpm --filter @paket/backend-api build` | `prisma migrate deploy` → `start` |
| `teamlead-web` | `apps/teamlead-web/railway.json` | `pnpm --filter @paket/teamlead-web build` | `start:prod` (writes `/env.js` → `vite preview`) |
| `employee-pwa` | `apps/employee-pwa/railway.json` | `pnpm --filter @paket/employee-pwa build` | `start:prod` (writes `/env.js` → `vite preview`) |

Point each Railway service's **Config-as-code path** at its `railway.json` above.

## What a redeploy touches — and what it does not

**A redeploy never deletes customer data.** The pre-deploy step runs `prisma migrate deploy`
only. The demo seed is destructive and therefore gated behind `SEED_ON_DEPLOY=1`, which is
**unset by default**:

```sh
# apps/backend-api/railway.json → deploy.preDeployCommand
prisma migrate deploy && if [ "$SEED_ON_DEPLOY" = "1" ]; then prisma db seed; else echo "…skipped"; fi
```

Two independent guards, so neither a stray Railway variable nor a manual shell wipes the
database by accident:

1. `preDeployCommand` calls `prisma db seed` **only** when `SEED_ON_DEPLOY=1`.
2. `apps/backend-api/prisma/seed.ts` refuses to run when `NODE_ENV=production` and
   `SEED_ON_DEPLOY` is not `1` — it exits non-zero before opening a connection.

A failing seed also fails the deploy now; the previous `|| echo seed-skipped` swallowed the
error and only ever masked a *crashing* seed, never a successful (and destructive) one.

If the seed *does* run (`SEED_ON_DEPLOY=1`), this is what happens:

| Data | Fate when the seed runs |
| --- | --- |
| Belege, Positionen, Bündel, ZST-Sätze, Transportboxen, Probleme | **Deleted**, replaced by the `standard` demo scenario (`resetCaseGraph`, `src/dev/scenarios/lib.ts`) |
| Lagerplätze created by the customer | **Set to `active = false`** — `seedLocations` deactivates every code outside the seed set |
| Seed employees (`ma-101` …) | **Reset** to seed values |
| Employees the customer created (own `employeeNo`) | Preserved |
| Verladeplan (`LoadPlanRule`) and `RuleConfig` | Preserved — `seedRuleConfig` only writes a missing row |

"Deterministic and idempotent" (the seed's own wording) describes the *result*, not
preservation: the same inputs always produce the same data, by wiping first.

**Loading a demo data state.** Set `SEED_ON_DEPLOY=1`, redeploy, then **remove the variable
again**. Alternatively use the admin-only Szenario-Panel (`/api/dev/*`, needs `DEV_PANEL`),
which drives the same scenario framework without a deploy.

> **Answer to open question E6 (customer).** Eva and Dustin may maintain Stammdaten (Shops,
> Verladeplan, Lagerplätze) and enter Belege from now on — a deploy leaves them alone. The only
> ways back to the demo scenario are the explicit `SEED_ON_DEPLOY=1` switch and the admin panel.

## Healthcheck — a deploy only counts once `/healthz` answers

`apps/backend-api/railway.json` sets `deploy.healthcheckPath: "/healthz"`. Railway now
promotes a backend deploy only after `GET /healthz` returns `200`; a build that crashes on
boot no longer counts as a successful deploy. The endpoints live unprefixed (`/healthz`,
`/readyz` — `src/health/health.module.ts`; `main.ts` sets no global prefix), so
`/api/health` intentionally does not exist.

## Watch paths — which changes trigger which deploy

Each service's `railway.json` declares `build.watchPatterns`. Watching only `apps/<name>/**`
would be wrong: every app also compiles workspace packages (its `build` script runs
`pnpm --filter "<app>^..." build` first), so a change confined to `packages/**` or to
`pnpm-lock.yaml` would **not** redeploy — and the customer would keep seeing old code.

The patterns mirror the `@paket/*` entries of each `package.json` (transitive closure):

| Service | Watches, beyond its own `apps/<name>/**` |
| --- | --- |
| `backend-api` | `packages/assignment-engine`, `packages/domain-types` |
| `teamlead-web` | `packages/api-client`, `packages/assignment-engine`, `packages/domain-types`, `packages/test-fixtures`, `packages/ui` |
| `employee-pwa` | `packages/api-client`, `packages/domain-types`, `packages/test-fixtures`, `packages/ui` |

All three additionally watch `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `tsconfig.base.json`
(every app's `tsconfig.json` extends it).

## Why runtime config (and not just build-time `VITE_*`)

Vite bakes `import.meta.env.VITE_*` into the bundle at **build time**. On Railway that
is fragile: a build that ran before the variables were set (or a cached build) silently
bakes in the `localhost` fallback — which is exactly the "cockpit: Failed to fetch" and
"Mitarbeiter-App → localhost:5175" symptoms.

So the frontends read config at **runtime** instead:

1. `index.html` loads `<script src="/env.js">` **before** the app bundle.
2. On container start, `scripts/write-runtime-env.mjs` regenerates `dist/env.js` from the
   service's environment variables: `window.__ENV__ = { VITE_API_BASE_URL: "…", … }`.
3. `src/config/runtimeEnv.ts` resolves each key as **runtime → build-time → localhost**.

Result: change a URL in the Railway dashboard and **Restart** — no rebuild needed.
(`/env.js` is excluded from the employee-pwa service-worker precache so it never goes
stale.)

## Environment variables to set

Set these in **Railway → service → Variables**. Replace the example hosts with your
actual Railway domains (Settings → Networking → Public Networking).

### `backend-api`

| Variable | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://user:pw@host:5432/db` | Required. Link a Railway Postgres (use its `DATABASE_URL` reference). `prisma migrate deploy` runs pre-deploy. |
| `CORS_ORIGINS` | `https://teamlead-web-production.up.railway.app,https://employee-pwa-production.up.railway.app` | Comma-separated allowed browser origins. Must match the frontend origins exactly (scheme + host, no trailing slash). `*` reflects any origin (demo only). |
| `NODE_ENV` | `production` | **Required.** Turns the Dev-Panel default off (`config.ts`) and arms the seed guard (`prisma/seed.ts`). Both fall back to permissive when it is unset. |
| `SEED_ON_DEPLOY` | _(unset)_ | **Leave unset.** `1` lets the pre-deploy run the **destructive** demo seed (wipes the case graph, deactivates non-seed Lagerplätze). Set it only to rebuild the demo state, then remove it again. |
| `DEV_PANEL` | `0` | Optional but recommended: makes `/api/dev/*` answer 404 outright. With `NODE_ENV=production` the panel is already off by default; `DEV_PANEL=1` forces it on for a demo deployment. |
| `PORT` | _(do not set)_ | Railway injects it; the server prefers `PORT` over `API_PORT`. |
| `AUTH_DEV_PUBLIC_KEY` | _(PEM)_ | Optional: verify dev RS256 tokens when there is no OIDC IdP yet. |
| `SWAGGER_ENABLED` | `false` | Optional: `/docs` is served by default. |

### `teamlead-web`

| Variable | Example | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://backend-api-production.up.railway.app` | Backend the cockpit fetches. Fixes "Cockpit konnte nicht geladen werden — Failed to fetch". |
| `VITE_EMPLOYEE_APP_URL` | `https://employee-pwa-production.up.railway.app` | "Zur Mitarbeiter-App" button target. Fixes localhost:5175. |
| `VITE_DEV_TOKEN` | `<rs256-jwt>` | Teamlead dev bearer token (until OIDC). Public (client-readable), like all `VITE_*`. |

### `employee-pwa`

| Variable | Example | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://backend-api-production.up.railway.app` | Backend the app fetches. **Unset ⇒ offline-demo mode** (no backend calls). |
| `VITE_TEAMLEAD_APP_URL` | `https://teamlead-web-production.up.railway.app` | "Zur Teamlead-App" button target. Fixes localhost:5174. |
| `VITE_DEMO_EMPLOYEE_NO` | `ma-108` | Demo only: prefills the Mitarbeiternummer on the login screen. Leave unset on any productively used environment — the field then starts empty. |

The PWA carries no `VITE_DEV_TOKEN`: employees authenticate through `POST /api/auth/login`
(Mitarbeiternummer, no PIN) and the app stores the token it receives.

> The two frontend ↔ backend URLs are circular: `teamlead-web`/`employee-pwa` need the
> backend URL, and the backend's `CORS_ORIGINS` needs both frontend URLs. Deploy the
> backend first to learn its domain, set the frontends, then come back and fill the
> backend's `CORS_ORIGINS` with the two frontend domains.

### Dev panel and role separation

`/api/dev/*` (Szenario-Panel, Zeit-Override) is protected twice. Nest runs the global
`JwtAuthGuard`/`RolesGuard` **before** the route-level `DevPanelGuard`, so the order of
responses is:

| Caller | Response |
| --- | --- |
| no token | `401` |
| valid non-admin token (e.g. the teamlead token in `/env.js`) | `403` — never reaches the env gate |
| admin token, `DEV_PANEL` off | `404` — the surface behaves as if it did not exist |
| admin token, `DEV_PANEL` on | `200` |

Consequence: a `403` proves role separation holds, but says **nothing** about whether the
panel is enabled. `VITE_DEV_TOKEN` is public (any visitor can read it from `/env.js`), so it
must never carry the `admin` role — it currently carries `realm_access.roles: ["teamlead"]`,
which is what keeps the destructive `POST /api/dev/scenarios/reset` out of reach from the link.

## Deploy order

1. **Postgres** — add the Railway Postgres plugin; copy its `DATABASE_URL` reference into `backend-api`.
2. **backend-api** — set `DATABASE_URL`, `NODE_ENV=production`; deploy. Note its public domain.
3. **teamlead-web** / **employee-pwa** — set `VITE_API_BASE_URL` to the backend domain and the cross-app URLs; deploy. Note their domains.
4. **backend-api** — set `CORS_ORIGINS` to the two frontend domains; **Restart**.

## Verify

```bash
# Backend is up and CORS allows the cockpit origin (expect 204 + access-control-allow-origin):
curl -i -X OPTIONS https://backend-api-production.up.railway.app/api/teamlead/cockpit \
  -H "Origin: https://teamlead-web-production.up.railway.app" \
  -H "Access-Control-Request-Method: GET"

# Frontends serve runtime config (expect the JSON you set, not an empty {}):
curl -s https://teamlead-web-production.up.railway.app/env.js
curl -s https://employee-pwa-production.up.railway.app/env.js
```

In the browser: open the **Teamlead cockpit** → the Tagescockpit loads data (no "Failed
to fetch"); click **Zur Mitarbeiter-App** → it opens the deployed employee PWA (no
`localhost:5175` / `ERR_CONNECTION_REFUSED`).

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Cockpit "Failed to fetch" | `/env.js` is `{}` (var not set on the service) | Set `VITE_API_BASE_URL` on `teamlead-web`, Restart. Confirm via `curl …/env.js`. |
| Cockpit reaches backend but browser blocks response (CORS error in console) | Backend `CORS_ORIGINS` missing/!= cockpit origin | Set `CORS_ORIGINS` to the exact frontend origin(s); Restart backend. |
| Button still goes to `localhost:5175`/`5174` | `VITE_EMPLOYEE_APP_URL` / `VITE_TEAMLEAD_APP_URL` unset | Set it on the frontend service, Restart. |
| `/env.js` shows old values after a change | Service not restarted, or (PWA) old service worker | Restart the service; hard-reload / clear the PWA. `/env.js` is not precached, so a reload suffices. |
| Frontend "Application failed to respond" | Railway target port mismatch | `vite preview` listens on 5174 (teamlead) / 5175 (employee); set the service's target port to match, or expose via the generated domain. |
| Backend deploy fails at pre-deploy | `DATABASE_URL` unset/invalid | `prisma migrate deploy` needs a reachable Postgres; set/relink `DATABASE_URL`. |
