# Railway deployment runbook

This monorepo deploys **three services** to Railway, each with config-as-code:

| Service | `railway.json` | Build | Start |
| --- | --- | --- | --- |
| `backend-api` | `apps/backend-api/railway.json` | `pnpm --filter @paket/backend-api build` | `prisma migrate deploy` → `start` |
| `teamlead-web` | `apps/teamlead-web/railway.json` | `pnpm --filter @paket/teamlead-web build` | `start:prod` (writes `/env.js` → `vite preview`) |
| `employee-pwa` | `apps/employee-pwa/railway.json` | `pnpm --filter @paket/employee-pwa build` | `start:prod` (writes `/env.js` → `vite preview`) |

Point each Railway service's **Config-as-code path** at its `railway.json` above.

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
| `NODE_ENV` | `production` | |
| `PORT` | _(do not set)_ | Railway injects it; the server prefers `PORT` over `API_PORT`. |
| `AUTH_DEV_PUBLIC_KEY` | _(PEM)_ | Optional: verify dev RS256 tokens when there is no OIDC IdP yet. |

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
| `VITE_DEV_TOKEN` | `<rs256-jwt>` | Employee dev bearer token (until OIDC). |

> The two frontend ↔ backend URLs are circular: `teamlead-web`/`employee-pwa` need the
> backend URL, and the backend's `CORS_ORIGINS` needs both frontend URLs. Deploy the
> backend first to learn its domain, set the frontends, then come back and fill the
> backend's `CORS_ORIGINS` with the two frontend domains.

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
