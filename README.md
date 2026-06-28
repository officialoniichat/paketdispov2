# Paketlagerdispo – Digitale Belegverteilung

Modular monolith for warehouse goods-receipt document distribution (L&T Logistics).
This repository is the **EPIC 1 foundation**: monorepo, shared domain types, database
schema, local infrastructure, and CI/observability baseline.

## Stack (§12)

- **Monorepo:** pnpm workspaces + Turborepo
- **Shared types:** `@paket/domain-types` – enums, interfaces and Zod schemas (Anhang A + D)
- **Backend:** Fastify modular monolith + Prisma + PostgreSQL (structured JSON logging, OpenTelemetry baseline)
- **Frontends:** React + Vite (employee PWA, teamlead/admin web)
- **Parser:** Python worker (PyMuPDF/pdfplumber) managed with `uv`
- **Infra:** Docker Compose – PostgreSQL, Redis, MinIO, Caddy

## Layout

```
apps/
  employee-pwa     Mitarbeiter-App (mobile-first PWA)
  teamlead-web     Teamlead/Admin dashboard
  backend-api      Fastify modular monolith (Prisma)
  parser-worker    Python PDF parser worker (uv)
packages/
  domain-types     Shared TS types, enums, Zod schemas
  api-client       Typed API client (OpenAPI client to follow)
  ui               Shared design-system components
  test-fixtures    Anonymised example documents and golden masters
```

## Quick start

```bash
pnpm install
cp .env.example .env

# 1. Infrastructure
docker compose up -d

# 2. Database schema
pnpm db:migrate          # prisma migrate dev

# 3. Build & verify
pnpm build               # turbo: all packages incl. domain-types
pnpm typecheck
pnpm test
```

## Deployment (Railway)

Three services deploy from this monorepo via config-as-code (`apps/<svc>/railway.json`):
`backend-api`, `teamlead-web`, `employee-pwa`. The frontends are served with
`vite preview` and resolve their URLs at **runtime** from `/env.js` (`window.__ENV__`),
so the variables below are read on container start — **no rebuild needed** when a URL
changes. Set them in the Railway dashboard (Service → Variables), then **Restart**.

**backend-api**

| Variable | Example | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://…` | Prisma (link a Railway Postgres) |
| `CORS_ORIGINS` | `https://teamlead-web-….up.railway.app,https://employee-pwa-….up.railway.app` | Allow the two frontends (comma-separated; `*` = any, demo only) |
| `NODE_ENV` | `production` | Enables prod mode |

**teamlead-web**

| Variable | Example | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://backend-api-….up.railway.app` | Backend the cockpit fetches (fixes "Failed to fetch") |
| `VITE_EMPLOYEE_APP_URL` | `https://employee-pwa-….up.railway.app` | "Zur Mitarbeiter-App" button target (fixes localhost:5175) |
| `VITE_DEV_TOKEN` | `<rs256-jwt>` | Dev bearer token (until OIDC) |

**employee-pwa**

| Variable | Example | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://backend-api-….up.railway.app` | Backend the app fetches (unset ⇒ offline demo) |
| `VITE_TEAMLEAD_APP_URL` | `https://teamlead-web-….up.railway.app` | "Zur Teamlead-App" button target |
| `VITE_DEV_TOKEN` | `<rs256-jwt>` | Dev bearer token (until OIDC) |

Railway injects `PORT` for the backend automatically — do **not** set it. Make the
backend's `CORS_ORIGINS` match the frontend origins exactly (scheme + host, no trailing
slash). Full runbook and troubleshooting: [`docs/deploy/railway.md`](docs/deploy/railway.md).

## Definition of Done (EPIC 1)

- `pnpm --filter @paket/domain-types build` – green
- `pnpm db:migrate` – `prisma migrate dev` runs against Postgres
- `docker compose up` – Postgres, Redis, MinIO, Caddy healthy
