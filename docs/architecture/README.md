# Paketlagerdispo — C4 Architecture Model

A [C4 model](https://c4model.com/) (Simon Brown) of the *Digitale Belegverteilung* system, plus a
type/domain model. **Every diagram is derived from and verified against the actual code on branch
`main`** (`apps/*`, `packages/*`, `apps/backend-api/prisma/schema.prisma`) — not invented.

- **Sources** (diagram-as-code): [`src/*.mmd`](src/)
- **Rendered output** (viewable, checked in): [`rendered/*.svg`](rendered/)
- **Combined viewer**: open [`index.html`](index.html) in a browser (L&T dark theme)

---

## Library choice: Mermaid — and why

| Option | C4 fidelity | Render toolchain | Viewable offline | Verdict |
| --- | --- | --- | --- | --- |
| **Structurizr DSL** | ★★★ canonical C4 model | needs Java + Structurizr CLI/Lite (or cloud) | only via Structurizr Lite/cloud | rejected — heaviest toolchain, weakest "just open it" story |
| **C4-PlantUML** | ★★★ | needs Java + PlantUML | static images | rejected — JVM dependency |
| **D2** | ★★ (not native C4) | needs the `d2` binary | static SVG | strong runner-up — beautiful, but extra binary + non-native C4 |
| **Mermaid** ✅ | ★★ native `C4Context`/`C4Container` + flowchart/ER/class | none (renders in Markdown/GitHub/HTML); optional `mmdc` for SVG | yes — plain SVG / any browser | **chosen** |

**Why Mermaid for this repo:**

1. **Toolchain-free to view.** Mermaid renders natively in Markdown, on GitHub, and in plain HTML.
   No proprietary cloud, no JVM. The checked-in SVGs open in any browser.
2. **Matches the existing docs pattern.** `docs/concept/*.html` are self-contained static HTML
   mockups in the L&T dark theme; [`index.html`](index.html) follows the same convention.
3. **One library covers every level.** `C4Context` / `C4Container` give canonical C4 semantics for
   levels 1–2; `flowchart` gives clean component (level 3) and code (level 4) diagrams; `erDiagram`
   gives the domain model; all in one diff-able text format.
4. **Reproducible.** Sources are plain text; [`render.sh`](render.sh) regenerates every SVG.

**Honest trade-off:** Mermaid's auto-layout for the native C4 diagram types is less polished than
Structurizr's. We therefore use the **native C4 types for levels 1–2** (where the C4 semantics matter
most) and the **diagram type that lays out cleanest** for the rest (flowchart for components/code, ER
for the domain model). This is the standard pragmatic Mermaid-C4 approach.

---

## Regeneration

Prerequisite: Node.js (repo already uses pnpm). The renderer
([mermaid-cli](https://github.com/mermaid-js/mermaid-cli)) is fetched on demand via `npx` and uses a
headless Chromium — no global install or cloud account needed.

```bash
cd docs/architecture

# Render all diagrams (src/*.mmd -> rendered/*.svg)
./render.sh

# Render a single diagram by basename
./render.sh c2-container
```

`render.sh` applies [`mermaid.config.json`](mermaid.config.json) (dark theme, L&T-leaning palette,
transparent background so the SVGs sit on the dark `index.html`). To preview without rendering,
paste any `src/*.mmd` into <https://mermaid.live> or a Markdown file on GitHub.

After editing a `.mmd` source, re-run `./render.sh` and commit both the changed source **and** its
regenerated SVG.

---

## The diagrams

| File | Level | What it shows |
| --- | --- | --- |
| `c1-system-context.mmd` | **C4 L1 — Context** | The system, its three human roles, and the external systems (ProHandel ERP, OIDC provider). |
| `c2-container.mmd` | **C4 L2 — Container** | Deploy/runtime units: employee-pwa, teamlead-web, backend-api, PostgreSQL, and the shared library packages; protocols (REST + SSE, SQL, in-process). |
| `c3-backend-components.mmd` | **C4 L3 — Component** | NestJS modules inside backend-api: Cases (Me/Cases/Teamlead), Assignment, Employees, Admin, and the cross-cutting Auth/Prisma/Events/Workflow/Live globals. |
| `c3-engine-components.mmd` | **C4 L3 — Component** | The pure `@paket/assignment-engine`: `assignWork()` orchestrator + priority/effort (incl. effort-factors)/capacity (incl. shift-end)/reserve/bundling/grouping/distribute/pickup modules. |
| `c3-employee-pwa-components.mmd` | **C4 L3 — Component** | employee-pwa: COLLECT→PROCESS→DONE screens, workflow hooks/guards, Dexie offline DB + optimistic-lock sync. |
| `c3-teamlead-components.mmd` | **C4 L3 — Component** | teamlead-web: cockpit/ablagen/board/belege/split/admin features, the `useCockpitData()` store, data layer, and the `caseActions` registry. |
| `c4-engine-pipeline.mmd` | **C4 L4 — Code** | The data flow inside `assignWork()`: shift-end cutoff → enrich → exclude → capacity → reserve → bundles → delivery-groups → distribute → pickup. |
| `domain-model.mmd` | **Domain / ER** | Prisma entities, relations and cardinalities; the Beleg-Kopf vs. Position (Warenbezeichnung/ASN-DESADV) split; config tables and the immutable WorkflowEvent log. |
| `type-pipeline.mmd` | **Types** | The type-generation chain: domain-types (Zod) ↔ Prisma ↔ OpenAPI → api-client (generated). |

### Level notes

- **L1 Context.** ProHandel ERP is the *intended* system of record (cases carry
  `source=prohandel_api` + `externalRef`), but the settings-configured delta-pull is **concept-stage**
  — there is no running ingestion service yet (only the `prohandel_api` enum + a teamlead
  "Integrationen" settings surface). The diagram marks this relationship accordingly. OIDC auth is
  implemented (`OidcTokenVerifier`, JWKS, with a dev RS256 key fallback).
- **L2 Container.** Caddy/Redis/MinIO appear in `docker-compose.yml` as an infra baseline but are
  **not wired by current backend code** (no bullmq/redis/minio/s3 dependencies); the backend talks
  only to PostgreSQL via Prisma, so they are omitted from the container diagram and noted instead.
- **L3 Component.** Four component views — one per "interesting" container. The backend view shows
  the audited write path (Controller → Service → WorkflowService → EventLogService → Prisma) and the
  SSE read path.
- **L4 Code.** The engine is pure and deterministic (no IO); the pipeline ordering mirrors
  `packages/assignment-engine/src/assignment/plan.ts`.
- **Domain / ER.** Cardinalities follow the Prisma relations exactly. Note the denormalised
  `AssignmentBundle → GoodsReceiptCase` link (`assignedBundleId`) alongside the ordered
  `AssignmentItem` join.

---

*This is documentation only — no production code or logic was changed to produce it.*
