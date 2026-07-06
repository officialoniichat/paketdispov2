# Task Plan: Task 2/3 — Mitarbeiter-App (employee-pwa) Dustin feedback integration

## Goal
Integrate ALL Mitarbeiter-App feedback points (Dustin Feldmann 03.07.2026) into apps/employee-pwa,
building on the merged foundation (mock-ERP fields + park/pool endpoints) on main @102841c.

Branch: `feat/employee-pwa-dustin` (worktree d9bf3, based directly on main tip — no rebase needed).

## Phases
- [x] Phase 0: Setup — branch created off main tip 102841c
- [ ] Phase 1: Explore — read all PWA screens/db/sync/workflow + foundation DTOs (/api/me/today shape, park endpoint, catalogs)
- [ ] Phase 2: Data layer — sync.ts/db.ts/types.ts/seed/scenarios/exampleAssignment carry new fields (LocationKind, EAN/EK/VK, Kartons, Prüfstufe, Sicherungstyp, Shop, WGR-desc, Catman, online-size, Abschnitt semantics, printLabels flag); Dexie schema bump; park support
- [ ] Phase 3: Commit "flow" — A1–A4 (env default, DemoControls dev-gate, Tisch login, greeting, hide header stats) + B1–B8 (merged one-screen Ware holen + Bearbeiten, kill /collect, wording, Preisetiketten hint, Rest parken, Teile only Hängeware, LocationKind icons, Lagerplatz 1:1, NOS/EB labels, free pick)
- [ ] Phase 4: Commit "beleg-detail" — C1–C6 (hero WE-Nr., Kartons count, Vororder/Nachorder, Arbeitsanweisung reorder + delete print/karton steps + §G.2 gate removal, Prüfstufe explain, per-position Etikett placement w/ pictogram)
- [ ] Phase 5: Commit "positionen" — D1–D7 (per-size EAN/EK/VK lines, +/- per Größe, layout, online-size red/green, Position geprüft un-checkable, Problem screen cleanup, Teilabschluss explain + Fertig-count fix)
- [ ] Phase 6: Quality gate — tests, pnpm typecheck 13/13, e2e offline seed, C4 c3-employee-pwa-components.mmd + render.sh, Conventional Commits (flow / beleg-detail / positionen)

## Key Questions
1. What exact shape does /api/me/today now return post-foundation (routeStops, positions, header fields)?
2. Where is the park endpoint and its DTO? (task says park/pool endpoints come from task 1 — verify they exist; if missing, add minimal backend park endpoint)
3. How are Prüfstufen / pictograms / online-size CSV served to the PWA?

## Decisions Made
- No rebase needed: d9bf3 worktree already at main tip 102841c.
- Overwrote plan/task_plan.md (was task-1 foundation plan, completed & merged).

## Errors Encountered
- Fact-Forcing Gate on first Bash call: quoted instruction, retried OK.

## Status
**Phase 1** — exploring PWA + foundation API surface.
