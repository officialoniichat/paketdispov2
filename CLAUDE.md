# CLAUDE.md — Paketlagerdispo (Digitale Belegverteilung, L&T Logistics)

Modular monolith that turns goods-receipt cases into fair, deterministic daily work bundles and
steers their lifecycle to Tagesabschluss (ZST). pnpm + Turborepo monorepo.

- **apps/**: `employee-pwa` (React PWA, offline-first), `teamlead-web` (React + MUI cockpit),
  `backend-api` (NestJS on Fastify + Prisma → PostgreSQL).
- **packages/**: `assignment-engine` (pure, deterministic planner), `domain-types` (Zod, single
  source of truth), `api-client` (generated from OpenAPI), `ui`.
- Mainline is `main` (canonical). Base all new work on `main`.

## Standing rules

- **Clean code, no legacy (ABSOLUTE PRIORITY).** Pre-pilot project: when replacing a concept, delete
  the old code outright. No backwards-compat shims, no dead config. Clean up first, then build.
- **Fachlogik is single-source.** The `assignment-engine` decides; the UIs only display. Don't
  re-implement business logic in the frontends.
- **Bereiche/Skills are a fixed vocabulary** derived from `LocationKind`, not a free-text admin
  catalog. A case's Bereich is fixed by its Lagerplatz kind.
- **Warenbezeichnung model (ASN/DESADV):** Beleg-Kopf fields (Filiale, Lieferschein, Abschnitt,
  Warenart) live on `GoodsReceiptCase`; article identity / NOS / Saison live on `ReceiptPosition`.
- **Quality gate:** keep `pnpm typecheck` green (13/13). Conventional Commits.
- **Keep the C4 model current (REQUIRED).** The C4 architecture model in `docs/architecture/` is a
  living artifact — it must always match the real code. Any change to containers, modules/components,
  the assignment-engine pipeline, the Prisma schema, or the type/codegen chain **must** update the
  matching `.mmd` source and re-rendered SVG in the *same* change set. Never let the diagrams describe
  code that no longer exists. Details + trigger list below.

## Architecture docs — keep them up to date

The C4 architecture model + domain/type diagrams live in **`docs/architecture/`** (Mermaid
diagrams-as-code). They are derived from and must stay faithful to the real code.

- Sources: `docs/architecture/src/*.mmd` — Levels: 1 Context, 2 Container, 3 Component (backend,
  assignment-engine, employee-pwa, teamlead-web), 4 Code (engine pipeline), plus Domain/ER and the
  type-generation chain.
- Rendered SVGs: `docs/architecture/rendered/*.svg`. Viewer: `docs/architecture/index.html`.
- Regenerate: `cd docs/architecture && ./render.sh` (uses mermaid-cli via npx; see its `README.md`).

**MANDATE — treat these diagrams as living docs.** Whenever a change affects architecture, update the
matching `.mmd` source in the same change set and re-run `./render.sh`, committing both the source and
the regenerated SVG. Triggers:

- New/removed/renamed **container** (app or shared package) → `c2-container.mmd`.
- New/removed **module, controller, service, screen, store, or major component** → the relevant
  `c3-*-components.mmd`.
- Change to the **assignment-engine pipeline** ordering or stages → `c3-engine-components.mmd` +
  `c4-engine-pipeline.mmd`.
- Prisma schema change (entity, relation, key, enum) → `domain-model.mmd`.
- Change to the type/codegen chain (domain-types ↔ Prisma ↔ OpenAPI ↔ api-client) → `type-pipeline.mmd`.
- A new external system or actor, or a changed protocol → `c1-system-context.mmd` / `c2-container.mmd`.

When in doubt, open `docs/architecture/index.html`, compare against the code, and fix any drift. Do
not let the diagrams describe code that no longer exists.
