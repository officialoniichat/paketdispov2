# Task Plan: Dustin Feedback v2 — Full Critical Review

## Goal
Pessimistic completeness review of ALL Dustin feedback (03.07.2026) against code at main (fdaaee3); fix safe gaps; write docs/review/dustin-feedback-v2-review.md.

## Phases
- [ ] Phase 0: Setup — git state (detached @ fdaaee3, verify == main), read 3 source feedback files verbatim
- [ ] Phase 1: Build completeness matrix (every feedback sentence → row) in plan/notes.md
- [ ] Phase 2: Verify each row against code (parallel Explore agents: PWA / Cockpit-Admin / Engine-Backend)
- [ ] Phase 3: Regression + quality gate (typecheck, build, lint, engine vitest, backend unit, test:int vs 18/41 baseline, OpenAPI regen diff, seed, dead-config grep, C4 diagrams)
- [ ] Phase 4: E2E browser smoke (pnpm dev, three apps)
- [ ] Phase 5: Fix PARTIAL/WRONG findings (small/medium), Conventional Commits
- [ ] Phase 6: Write docs/review/dustin-feedback-v2-review.md + memory update

## Key Questions
1. Detached HEAD == main? Where to commit fixes? (answer: verify refs; commit on main)
2. Which feedback points are half-wired/dead config?
3. New test:int failures vs 18/41 baseline?

## Decisions Made
- Aufwand tab/effort model KEPT per user steer — verify intact; only pack sizing must be Teile-based.

## Errors Encountered
- Fact-Forcing Gate on first Bash — quoted instruction, retried OK.

## Status
**Phase 0** — reading source files + verifying main ref
