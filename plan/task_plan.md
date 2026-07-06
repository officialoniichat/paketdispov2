# Task Plan: Task 2/3 — Mitarbeiter-App (employee-pwa) Dustin feedback integration

## Goal
Integrate ALL Mitarbeiter-App feedback points (Dustin Feldmann 03.07.2026) into apps/employee-pwa,
building on the merged foundation (mock-ERP fields) on main @102841c.

Branch: `feat/employee-pwa-dustin` (worktree d9bf3, based directly on main tip — no rebase needed).

## Phases
- [x] Phase 0: Setup — branch off main tip 102841c
- [x] Phase 1: Explore — PWA + foundation API surface mapped (agent report in notes.md)
- [x] Phase 2: Backend prerequisites (commit 8e3a0a2) — storageLocationKind + priceLabelPrintRequired
      on CaseSummaryDto, SkuLineDto.onlineMark (deriveOnlineSizeMarks in domain-types),
      POST /api/me/workstation (A2), POST /api/me/park (B4, Event case.parked_by_employee),
      bundle-mutations.ts extraction, OpenAPI + api-client regen
- [x] Phase 3: Commit "flow" (7163972) — A1–A4 + B1–B8, Dexie v5, CollectScreen gelöscht
- [x] Phase 4: Commit "beleg-detail" (ce445e7) — C1–C6, LabelPlacementHint gelöscht
- [x] Phase 5: Commit "positionen" (17db7eb) — D1–D7
- [x] Phase 6: Quality gate — typecheck 13/13 ✓, unit tests 13/13 suites (PWA 69) ✓, lint 8/8 ✓,
      build 8/8 ✓, e2e 7/7 ✓ (offline seed, VITE_DEMO_CONTROLS=1), C3 PWA+Backend .mmd + render ✓
      (commit 0e4da57), stale screenshots pruned (91f1c97)

## Decisions Made
- Missing backend pieces (park, workstation-claim, LocationKind, onlineMark) added in a
  dedicated feat(api) commit — task assumed them from task 1 but they did not exist.
- Employee park = assigned→ready back to pool (withdraw semantics), NOT teamlead 'parked'.
- Online-Rot/Grün computed server-side (Fachlogik single-source); demo seed mirrors via
  the same pure deriveOnlineSizeMarks.
- Tisch claim persisted locally (localStorage) + POST in backend mode; today.workstation
  mirrors back on sync.
- D7: BelegStatus 'partial' — Teilabschluss never counts as 'Fertig'.

## Errors Encountered
- Fact-Forcing Gate on first Bash call — quoted instruction, retried OK.
- Stale package dists (tsbuildinfo no-op emit) → rotated dist + tsbuildinfo, rebuilt.
- employee-pwa node_modules symlinks (Documents/908e8) → repointed @paket/api-client +
  domain-types to this worktree (known gotcha).
- e2e: Intl € uses narrow no-break space; Lagerplatz code appears twice (stop + Beleg row).

## Status
**DONE** — 6 commits on feat/employee-pwa-dustin, not pushed/merged.
