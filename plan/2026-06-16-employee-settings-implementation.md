# Employee-Settings — Full Implementation Plan

Branch: `feat/employee-settings`. Spec: `docs/concept/employee-settings-ux-concept.md`.
Goal: make worker capacity (wer/wann/wie lange) an editable, audited source feeding the
assignment engine — per the concept, end-to-end (data model → engine → backend → UI).

## Architectural decision
- §8.2 effort stays per-Beleg (unchanged). The employee side influences **capacity**.
- Per-head `productivityFactor` is applied where `netCapacityMinutes` is **derived**
  (engine `net-capacity.ts` + backend on shift write), NOT in `distribute.ts` — keeps
  the 49 engine tests green and `distribute.ts` reads `netCapacityMinutes` as-is.
- `overtimeTolerancePct` + `areaTags` are profile data surfaced to the UI/board; the
  engine's WGR-based specialist penalty is unchanged (area→WGR mapping is future work).

## Steps
1. domain-types/workforce.ts: employeeProfile, weeklyPattern, absence, shiftSource enum,
   optional source/productivityFactor on employeeShift.
2. engine net-capacity.ts: per-row productivityFactor override (+ unit test).
3. prisma: User fields, Shift.source, Absence model, hand-authored migration, generate.
4. backend: EmployeesModule (list/detail/profile PATCH/shift PUT/absence POST) + audit
   events; register in app.module; integration test.
5. regenerate openapi + api-client.
6. teamlead-web: data/employees.ts + EmployeeSettings (list/detail/weekly/absence/params),
   Tab 7 "Mitarbeiter" in AdminPage.
7. seed + full build/test verification; commit.

## Status: done
All 7 steps complete. Verified: engine 111 tests (incl. 3 new per-head capacity),
backend typecheck clean + OpenAPI emits 4 employee endpoints, api-client drift test
passes, teamlead-web typecheck + production build green.

Follow-up (env-gated, not done): backend integration test for the employees module
needs Docker/Testcontainers (same constraint as the existing lifecycle.int.test).
Roles editing kept read-only this pass (identity stays in the IdP). The recurring
worktree gotcha (pnpm resets @paket symlinks + Prisma client) is documented in memory.
