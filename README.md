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

## Definition of Done (EPIC 1)

- `pnpm --filter @paket/domain-types build` – green
- `pnpm db:migrate` – `prisma migrate dev` runs against Postgres
- `docker compose up` – Postgres, Redis, MinIO, Caddy healthy
