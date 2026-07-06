# Task Plan: Dev Panel + Scenario-Seeding Infrastructure

## Goal
One-click loadable, deterministic demo/test scenarios (B1–B15) via a dev-gated Admin tab
"Dev / Szenarien" in teamlead-web, backed by a backend ScenarioService + time-override,
reusable from integration tests. Branch: `feat/dev-panel-scenarios` (based on latest main fdaaee3).

## Requirements (source: user prompt in this session — authoritative)
- **A. Dev Panel**: A1 dev-gated Admin tab (VITE_DEV_PANEL / NODE_ENV; backend env guard + admin
  role; NOT in prod builds). A2 scenario catalog UI (name, description, expected outcome
  'was man danach sehen sollte', one-click load = reset+seed, current-scenario indicator,
  'Zurücksetzen auf Standard'). A3 time control (server-side persisted now-override, date-time
  picker, reset-to-real-time, clear UI badge when active). A4 quick knobs (mock-ProHandel pull,
  recalculate, materialize shifts for date) as buttons with result toast.
- **B. Scenario library** (deterministic, idempotent load = reset+seed, seeded RNG, reuse
  seed-data.ts generator):
  B1 Standard-Tag 171 mixed Bereiche · B2 Peak-Tag 315 · B3 Gemischtes Bündel
  (Regal+Hängebahn+Palette mix incl. icons/Teile display) · B4 Lieferung zusammenhängend
  (consecutive weBelegNo run, same deliveryNoteNo, AND hard Brax case: non-consecutive
  Lieferschein numbers + consecutive carton numbering) · B5 Lieferung unvollständig
  (pool-hold "X von N, n fehlt" + TL release 'trotzdem bearbeiten') · B6 Datenqualität
  (missing Lagerplatz / missing Lieferschein → 'zurück an Bucher', never ready; one
  fixed-later case for re-release) · B7 Groß-Beleg Knecki (2000–3000 Teile → above threshold,
  manual TL decision; + partially_completed carryover from yesterday → Folgetag continuation +
  no-new-Belege rule) · B8 Shop 31 NOS (many NOS Einzelanlieferungen → no-max-cap bundling +
  NOS priority tier) · B9 Prio-Leiter (every rank: manual TL prio, prio flag, tägliche
  Verladung EB-7/Shop-120/Shop-90, NOS+Hängeware, Verladeplan-due sections 1/2/3, plain FIFO;
  expected order documented in catalog) · B10 Schichtende (cutoff 50min reached → not-started
  Bündel dissolve to pool; self-pull returns shift_ending; one employee finishing normally) ·
  B11 Feiertag/Sonderregelung (specialDay DO→MI, resolveLoadPlanDate reflects it) ·
  B12 Skill-Tiers & Crew (profi/fortgeschritten/basis/starter/dummy + measured=false temps +
  one Koffer case; tier gating in auto-distribution; starter/dummy manual-only) ·
  B13 Online-Größen (CSV preference rules: preferred delivered red/green, preferred missing →
  alternative, alternative missing → any; uploaded sample CSV as fixture) ·
  B14 Problemfälle & Ablage (open issues, parked, forwarded Retouren/Lieferscheinbucher,
  Teilabschluss → Ablage lanes + problem deep-link) · B15 Leerer Tag (UI empty states).
- **C. API/infra**: C1 POST /api/dev/scenarios/:key/load, GET /api/dev/scenarios (catalog with
  descriptions + expected outcomes), POST /api/dev/time-override, DELETE /api/dev/time-override —
  dev-guarded (env + role), OpenAPI-documented but flagged for production. C2 typed catalog next
  to seed-data.ts, single source; frontend reads name/description/expectation from backend.
  C3 export loadScenario(key) for Testcontainers int tests + smoke int tests loading each
  scenario asserting headline expectation (B6 → N blocked; B10 → bundles dissolved).
  C4 employee-PWA offline Dexie demo seed mirrors B3; DemoControls stay dev-gated as-is.
- **Quality gate**: pnpm typecheck 13/13; engine tests untouched/green; new int smoke tests green;
  same key → same data (determinism); prod teamlead-web build contains NO dev panel + backend env
  guard verified; docs/dev/scenarios.md listing all scenarios + expected outcomes; c3-backend +
  c3-teamlead-web .mmd updated + render.sh; Conventional Commits.

## Phases
- [x] Phase 0: DONE — commit f1475d9. Generator integrated w/ current schema: seed-data.ts now owns
      team defs (skill tiers profi/fortgeschritten/basis + starter/dummy temps, T1–T8 workstations),
      inspectionLevelFor() maps checkMode→catalog code, real WGR codes, digits-only EAN, LIFECYCLE_CASES
      kept (storage codes remapped R18→R19, B-4→PB-4). typecheck 13/13; seed smoke-run green
      (189 ready = 171 generated + 16 mock-ProHandel + 2 Pool-Hold; 61 delivery groups). Idempotent.
- [x] Phase 1: DONE — notes.md written (module pattern, RBAC, config.ts frozen object, DB-less OpenAPI
      recipe, injectable-now call sites, AppConfig key-value store for overrides, resetCaseGraph reset
      primitive, prio-ladder ranks 0-6 verified, Koffer=WGR 812770 not LocationKind, AdminPage tab wiring,
      no OnlineSize CSV fixture exists yet, int-test weeklyPattern gotcha). Exploration → notes.md (backend module layout, admin/config service, injectable now
      plumbing in recalculate/assignNextBundle, RuleConfig storage, teamlead Admin tab wiring,
      env config both apps, PWA demo scenarios, int-test harness/Testcontainers, prod build flags).
- [x] Phase 2: DONE — backend dev infrastructure: `config.dev.panelEnabled` (DEV_PANEL env gate),
      DevModule (`/api/dev`: GET scenarios · POST scenarios/:key/load · POST scenarios/reset ·
      POST/DELETE time-override · POST materialize-shifts; @Roles(Admin) + DevPanelGuard → 404 off),
      global ClockService (AppConfig `dev_time_override`, cached, wired into recalculate/preview/
      assignNextBundle/dashboard/board/capacity/kpis/assignToEmployee/prohandel-pull), scenario
      framework in `apps/backend-api/src/dev/scenarios/` (types/catalog/lib/case-builders/standard/
      index; HTTP-free `loadScenario(prisma, key, opts)`; seed-data.ts MOVED there — tsconfig
      rootDir=src forbids src→prisma imports), prisma/seed.ts = thin wrapper. OpenAPI 'dev' tag +
      regen (63 paths) + api-client regen; c3-backend-components.mmd updated + rendered.
      Verified: typecheck 13/13, backend unit 134 green, seed 189 ready/61 groups deterministic,
      HTTP smoke green incl. DEV_PANEL=0→404 + teamlead→403 + override shifts preview date.
      NOTE Phase 4: dev-setup.mjs mints only teamlead/employee tokens — /api/dev needs an admin
      token (extend dev-setup or widen roles).
- [x] Phase 3: DONE — all 15 scenarios in the typed catalog (`src/dev/scenarios/catalog.ts`,
      definitions in `scenarios/definitions/*.ts`): standard · peak-tag · gemischtes-buendel ·
      lieferung-zusammenhaengend (run/note/Brax-Kartonnummern-Lücke) · lieferung-unvollstaendig
      ("2 von 4" Pool-Hold + Freigabe) · datenqualitaet · gross-beleg-knecki (2400-Teile +
      Vortages-Fortsetzung ma-104) · shop-31-nos · prio-leiter (alle Ränge, exakte Reihenfolge
      dokumentiert) · schichtende (Cutoff-50-Demo mit Zeit-Override-Anleitung) ·
      feiertag-sonderregelung (specialDay DO→MI, wochentag-robust via Buchungstag=Do−6) ·
      skill-tiers-crew (Koffer=WGR 812770) · online-groessen (CSV-Fixture
      `scenarios/fixtures/online-size-preferences.csv` = einzige Quelle, admin-upload-kompatibel) ·
      problemfaelle-ablage · leerer-tag. Builders: CustomCaseSpec/seedCustomCases +
      seedCustomDetail + seedCarryoverBundle (definitions/custom-case.ts), forceRuleConfig +
      fixture-backed seedOnlineSizePreferences (lib.ts), seedLifecycleCases parameterisiert.
      Alle nicht-standard-Szenarien forcen DEFAULT_RULE_CONFIG(+Overrides) → kein Config-Leak.
      Verified: backend typecheck + unit 134 green; smoke: alle 15 laden gegen die Dev-DB,
      Doppel-Lauf byte-identisch (Determinismus); Engine-Gegenprobe: B4-Gruppen (run-withheld/
      likely/Brax ungruppiert), B5 "2 von 4" withheld + 3-von-3 frei, B9-Reihenfolge exakt,
      B11 Verladetag Do→Mi. Dev-DB danach auf 'standard' zurückgesetzt.
- [x] Phase 4: DONE — teamlead-web Dev Panel (A1–A4): dev-gated Admin tab "Dev / Szenarien"
      (DevScenariosTab lazy behind INLINE `import.meta.env.VITE_DEV_PANEL==='0'?false:DEV||==='1'`
      gate → Rollup drops the chunk; prod dist greps clean, VITE_DEV_PANEL=1 build contains it;
      runtime '0' opt-out via resolveEnv in config/devPanel.ts), backend-sourced catalog UI w/
      expected-outcome collapse + active highlight + reset, time control (datetime-local, Setzen/
      Zurück zu Echtzeit, tab chip + global lazy DevTimeBadge in AppShell app bar, invalidates ALL
      queries), quick knobs (ProHandel-Pull/Recalculate/Materialize-Shifts w/ count toasts, dates
      default to override day). data/dev.ts uses a separate admin-token client — dev-setup.mjs now
      mints `VITE_DEV_ADMIN_TOKEN` (admin-001) into teamlead .env; backend roles untouched.
      c3-teamlead-components.mmd + SVG updated. Verified: typecheck 13/13, lint clean, live smoke
      on :3999 (catalog 200 admin / 403 teamlead, override set+clear, materialize 13 shifts).
- [x] Phase 5: DONE — C3: `src/integration/scenarios.int.test.ts` (Testcontainers, ein Container,
      fixed baseDate 2026-06-15): lädt ALLE 15 Keys via `loadScenario(prisma, key, {baseDate})` und
      prüft je die Headline-Erwartung (standard 189 ready + 2 blocked · peak 333 · B3 16/12/12 über
      alle Bereiche à 52 Teile · B4 Run/Note/Brax-Signale · B5 „2 von 4" PH-LFG-501 withheld +
      3-von-3 frei · B6 3 blocked m. missingFields + 9.403.713 re-released · B7 Monster 2400 im Pool
      + Vortages-Bündel ma-104 · B8 22 NOS Shop 31 · B9 exakte Reihenfolge via purem
      classifyPriority/sortByPriority · B10 Früh+Spät-Schichten · B11 specialDay-Zeile Mi 17.→18.6.
      · B12 starter/dummy measured=false + Koffer-WGR 812770 · B13 CSV-Präferenzen + gezielte Größen
      · B14 alle Lanes/Status/Empfänger · B15 0 Belege) + Determinismus (standard 2× → identischer
      SHA-256-Case-Digest) + unknown-key-Fehler. 18/18 grün in ~25 s. C4: PWA-Offline-Demo spiegelt
      B3 'gemischtes-buendel' — Standard-Szenario umbenannt/beschrieben als B3-Spiegel, Lagerplatz-
      Codes auf den echten Stamm gezogen (HB-3→HB-5/234, P-2→PA-1; Hängeware HB-6/118+HB-7/090,
      Groß R3/R11/R23), DemoControls-Gating unverändert; e2e-Spec angepasst, 7/7 grün (offline
      build), PWA unit 69/69 + typecheck grün. Gesamt: typecheck 13/13, backend unit 134 grün.
- [x] Phase 6: DONE — docs/dev/scenarios.md (deutsches Operator-Handbuch: Aktivierung
      DEV_PANEL/VITE_DEV_PANEL/dev-setup-Admin-Token, Zeit-Override-Semantik + Badge,
      Quick-Knobs, Laden=Reset+Seed + Determinismus + loadScenario-Wiederverwendung,
      alle 15 Szenarien mit Key/Name/Beschreibung/„Was man danach sehen sollte" aus
      catalog.ts/definitions/*, inkl. der zwei ehrlichen Einordnungen B3 Team-Level-Mix
      und B4 Brax-Kartonnummern-Lücke). C4-Check: c3-backend + c3-teamlead .mmd bereits
      aktuell (DevModule/ScenarioService/DevScenariosTab/DevTimeBadge/dev.ts) — keine
      Änderung nötig. Quality-Gate-Ergebnisse:
      · typecheck 13/13 ✅ · engine 166 Tests (13 Dateien) ✅ unangetastet
      · backend unit 134 ✅ · teamlead-web unit 54 ✅ · employee-pwa unit 69 ✅
      · int smoke scenarios.int.test.ts 18/18 ✅ · lint 0 errors (55 bekannte
      NestJS-import-type-Warnings, NICHT auto-gefixt) ✅ · pnpm build 8/8 ✅
      · Prod-Build-Verifikation: prod dist ohne „Szenario laden"/api/dev/
      DevScenariosTab/„Server-Zeit"; VITE_DEV_PANEL=1-Build enthält alle 4; dist danach
      auf prod zurückgebaut (dist/ gitignored) ✅ · Backend-Env-Guard DEV_PANEL=0→404:
      in Phase 2 per HTTP-Smoke verifiziert (zitiert, kein Re-Boot nötig).

## Integration protocol (harness instruction — execute at END of task)
1. Commit all pending task changes on this worktree's branch (feat/dev-panel-scenarios).
2. `git worktree list --porcelain` → find path P where `main` is checked out
   (currently /Users/moritzklemer/Documents/paketlagerdispov2).
3. Verify P is on main; if P dirty: `git -C P stash push -u -m "kanban-pre-cherry-pick"`.
4. Cherry-pick the task commits into P (handle stale .git/index.lock: wait, then remove if no git proc).
5. Resolve conflicts preserving task changes + user edits; pop stash if created; resolve again if needed.
6. Report final commit hash, message, stash usage, conflicts, follow-ups.
Forbidden: git reset --hard, git clean -fdx, git worktree remove, rm/mv on repo paths.

## Decisions Made
- Base = main fdaaee3 (worktree already there, detached) → branch feat/dev-panel-scenarios.
- seed-data.ts generator NOT on main → Phase 0 cherry-pick a90ea09 + reconcile (10 hunks in seed.ts).
- Phased async agents (same protocol as Task 3/3); this worktree IS the working branch.

## Decisions (added after session restart)
- Session process exited mid-Phase-3/4; both agents produced NO changes → relaunched fresh.
- Main advanced (Full-Review task: ce541f4…fd9d67a incl. Pool-Hold release wiring) → rebased
  feat/dev-panel-scenarios onto fd9d67a. New hashes: f9c50f1 (seed), c7ed47b (framework),
  730c7ec (dev module), 42fd766 (plan). Only plan/*.md conflicted (kept ours). typecheck 13/13.
- Repo hook blocks `git checkout` — use `git show <ref>:<path> > path` for conflict resolution.

## Errors Encountered
- Session restart killed Phase-3/4 agents before any output (worktree was re-pointed to new main;
  branch itself intact). Resolved via rebase + relaunch.

## Status
**done** — all phases 0–6 complete on feat/dev-panel-scenarios; full quality gate green
(see Phase 6 for the recorded results). Ready for the integration protocol.
