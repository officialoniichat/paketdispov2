# Mitarbeiter-App Rework — Design Spec

**Date:** 2026-06-16
**Scope:** `apps/employee-pwa` + the API client contract it consumes (`@paket/api-client` DTOs for `/api/me/today` and `/api/me/cases/:id/aggregate`).
**Out of scope:** server-side engine logic that *produces* box targets and server-side enforcement of completion gates. This spec defines the DTO contract those must satisfy and makes the PWA fully correct against it. Backend population may remain as-is/stubbed.
**Companion mockups:** `docs/concept/mitarbeiter-app-ux-mockups.html`

---

## 1. Problem

The current Mitarbeiter-App models the day as **one rigid bundle** with a **forced pickup order** ("Paket 1 von 1", `bundle.pickupStops` sorted by `sequence`). That is wrong on three counts:

1. **Assignment vs. selection are conflated.** The worker is assigned individual Belege by the system (engine), but in reality he chooses *which assigned Beleg to work next* and must complete *all* of them. The app forces a sequence and crams everything into a single "Paket".
2. **Several steps are decorative or missing.** The Lagerplatz scan advances regardless of what was scanned; the Vorbereitung checkboxes all flip on one boolean; the physical "sort positions into boxes" step (the real packing decision) does not exist; open problems do not block ZST.
3. **Data is faked.** `sync.ts` synthesizes a single SKU line per position, so multi-position / multi-SKU Belege are not handled dynamically.

## 2. Goals

- Replace the forced bundle/order with a **priority-sorted, freely selectable Beleg list** as the home hub. Assignment stays **system-only**; the worker never self-assigns.
- The worker must complete **all** assigned Belege but chooses the order; the recommended (top, highest-prio, open) is highlighted, every Beleg is tappable, each keeps its in-progress state.
- Make the per-Beleg flow correct and dynamic: validating scan, real multi-position/multi-SKU handling, a real box-sort step, and a completion gate that blocks ZST on open problems.
- Delete the dead forced-order code outright (no compat shims), single-source fachlogik (engine decides, UI displays).

## 3. Non-Goals

- No self-pull / worker-initiated assignment.
- No new state-machine library (the existing pure-reducer model stays).
- No server-driven UI; offline-first (Dexie + `useLiveQuery`) is preserved.
- No rework of the Teamlead/Admin apps beyond the shared DTO contract.

## 4. Architecture (evolve, don't rewrite)

Keep the proven structure:
- **Pure model** `workflow/workflowModel.ts` — immutable reducers + `nextBestAction` + gates. No persistence, no I/O.
- **Binding** `workflow/useCaseFlow.ts` — applies a transition, persists under optimistic lock, appends an audit event, optional best-effort backend POST.
- **Store** `db/*` (Dexie), **sync** `db/sync.ts` (mirror assigned work), **screens** `screens/*` task-first.

### 4.1 Information architecture / routes

| Route | Screen | Notes |
|-------|--------|-------|
| `/` | **Belegliste hub** | prio-sorted, every Beleg tappable, status chips, day context (Verladetag, eilige Belege, progress). Replaces Tagesstart→`/paket`. |
| `/case/:id/pickup` | Holen + Scan | reached by tapping a Beleg; validating scan |
| `/case/:id/prepare` | Vorbereitung | labels-before-unpack guardrail; real step ticks |
| `/case/:id/positions` | Position (1..N) | dynamic multi-position, multi-SKU |
| `/case/:id/sort` | **Boxen sortieren (new)** | engine-proposed mapping, worker confirms |
| `/case/:id/boxing` | Box abschließen | Zettel→Plombe→Band; Hängeware branch skips |
| `/case/:id/complete` | Abschluss / ZST | gate blocks on open problems; partial close |
| `/case/:id/problem` | Problem melden | reachable from every step; no preselected type |

After `complete`, navigate to `/` (hub), which highlights the next recommended (top open) Beleg.

**Deleted:** `screens/PaketReihenfolgeScreen.tsx`, the `/paket` route, `PickupStop[]`/`pickupStops` ordering semantics, and all "Sammelrunde / Milk-Run / Paket X von Y" wording.

### 4.2 Data model

- **Assignment list (replaces `AssignedBundle.pickupStops`):** introduce `BelegListItem`:
  - `caseId`, `weBelegNo`, `prioRank` (number; lower = higher prio), `section` (`SectionCode | null`), `storageLocationCode`, `goodsType` (`regal | palette | haengeware | mixed`), `totalQuantity`, `status` (derived view status: `open | in_progress | done | issue`).
  - The day context (`employeeName`, `workstation`, planned window, `verladetag`, counts) lives on a small `DayContext` record.
  - Sorting & "next recommended" are **pure selectors** over `BelegListItem[]` + per-case `CaseProgress` (no forced order persisted).
- **`CaseStep`** union gains `'sort'`, ordered: `pickup → prepare → positions → sort → boxing → complete → done`.
- **`CaseProgress`** gains:
  - `boxAssignmentConfirmed: boolean`
  - per-box `positionIds: string[]` (the confirmed mapping, seeded from engine proposal)
  - existing fields unchanged (optimistic-lock `version` owned by the repository).

### 4.3 DTO contract (`@paket/api-client`)

`/api/me/today` returns the **assigned case list** (no bundle-order semantics consumed by the PWA):
- per case: `id`, `weBelegNo`, `bookingDate`, `storageLocationCode`, `goodsType`, `section`, `priorityFlags[]`, `prioRank`, `totalQuantity`, `estimatedMinutes`, `status`.
- day context fields used by the hub (planned window, verladetag if available).

`/api/me/cases/:id/aggregate` returns:
- `case` (incl. `storageLocation.code`, `goodsType`), `workInstruction`,
- **`positions[]` with real `skuLines[]`** (multiple per position; `ean`, `size`, `expectedQuantity`),
- **`boxTargets[]` with `positionIds[]`** (engine's proposed position→box mapping), `shopAreaNo`, `shopNo`, `floor`, `goodsType`, `plannedQuantity`.

`sync.ts` change: **remove** the single-synthesized-SKU fallback in `toPositions`; map real SKU lines. If the backend currently omits them, the contract requires them and the PWA maps whatever arrives, rendering N positions × M SKU lines.

## 5. Behavior detail

### 5.1 Belegliste hub (selection model)
- Renders `BelegListItem[]` sorted by `prioRank` then booking time. Each row: goods-type icon, `WE`, section chip (NOS/Extra), Lagerplatz, quantity, status chip.
- Top open Beleg = **"empfohlen"** (highlighted). Primary button = "Empfohlenen starten"; any row is tappable to start/resume that Beleg.
- In-progress Belege show their resume point ("Position 2 von 3") from `CaseProgress`.
- Day-end: when all `done`, show "alle erledigt"; `loadAssignedWork` re-fetch surfaces new engine assignments; the button only triggers a refresh (never a self-assign).

### 5.2 Holen + Scan (hard block)
- Shows the chosen Beleg's `storageLocation.code`. `confirmPickup(scanned)` **only advances when `scanned === storageLocation.code`** (normalized compare).
- Mismatch → blocked with a clear "falscher Lagerplatz (erwartet X / gescannt Y)"; options: rescan or "Paket nicht da → Teamlead" (emits an issue/`pickup.not_found` event). Hardware-wedge scan + manual fallback unchanged.

### 5.3 Vorbereitung
- Primary stays "Etiketten drucken" until printed (labels-before-unpack guardrail, `priceLabelPrintRequired`), then "Karton geöffnet"/"Sortierung fertig" as **individually-confirmed** steps (no single-boolean fan-out). Show label count + station from the work instruction/position instruction.

### 5.4 Positionen (dynamic)
- Iterate all `positions`; for each, render all `skuLines`. Progress segments = Position X von N.
- Minimum-quantity check always required (`minimumQuantityCheckAlwaysRequired`); the quantity to confirm is the **sum across that position's SKU lines**. "Position korrekt" gated behind the quantity check.

### 5.5 Boxen sortieren (new; engine proposes, worker confirms)
- Show `boxTargets[]` as the proposed mapping (positions grouped by box / shop area).
- Worker **confirms** → `boxAssignmentConfirmed = true`, seeds each `BoxProgress.positionIds`.
- A worker change emits `box.reassigned` (event for the Teamlead). Single-source: the engine owns the proposal; the UI displays/confirms.
- Hängeware (`goodsType === 'haengeware'`): skip boxing/seal/conveyor; close path = labels attached + Hängeschild + onto Hängewagen.

### 5.6 Abschluss / ZST (gate)
- `canCompleteCase` returns `ok` only when: all positions confirmed **and** minimum-quantity checks done **and** (if `boxLabelRequired`) all boxes sealed **and** **no open `issue.created` for the case**.
- Blocked state shows the reasons; **Teilabschluss** with a required reason remains (emits `case.partially_completed`), shipping the finished part.
- ZST shows the worker their running pace (Teile/Std vs. target) as feedback.

### 5.7 Problem melden
- Reachable from every step. Ebene + Problemtyp as chips with **no preselection**; optional comment/photo. Emits `issue.created` scoped to position/SKU/box/case and marks the affected scope "in Klärung" (which keeps the completion gate closed).

## 6. Components / files

**Edit:** `App.tsx` (routes), `db/types.ts` (`BelegListItem`, `DayContext`, `CaseStep+'sort'`, `CaseProgress` fields), `db/sync.ts` (list + real SKU mapping), `db/repository.ts` (list accessors, box mapping persistence), `workflow/workflowModel.ts` (`'sort'` transitions, scan-match helper, gate incl. open-issues, `nextBestAction`), `workflow/useCaseFlow.ts` (new actions/events), `screens/*` (hub, scan, sort, others adjusted).
**New:** `screens/BelegListeScreen.tsx` (hub), `screens/BoxenSortierenScreen.tsx`.
**Delete:** `screens/PaketReihenfolgeScreen.tsx` + `/paket` route + `PickupStop` type/usage.
**Keep file sizes within 200–400 lines; split if a screen grows.**

## 7. Testing (≥80%)

Extend pure-model tests (no I/O) — `workflowModel.test.ts`, `skip.test.ts`, plus new specs:
- list sorting + "next recommended" selector; status derivation.
- scan match advances; mismatch blocks.
- multi-position + multi-SKU: quantity sum, all-positions-confirmed.
- box-sort confirm seeds `positionIds`; deviation event.
- completion gate: open issue blocks ZST; partial close path.
- Hängeware branch skips boxing.
- day-end all-done state.
Component smoke tests for the hub and scan screens where they carry logic. `sync.ts` mapping test for real SKU lines + list shape.

## 8. Risks / mitigations

- **DTO drift** (backend may not yet emit `prioRank`/`skuLines`/`positionIds`): contract is explicit here; PWA maps defensively (validate with the zod schemas already in `@paket/domain-types`), and a mapping test pins the shape. Cross-worktree symlink/`tsbuildinfo` rebuild gotchas apply when regenerating the client.
- **Engine box proposal absent:** fall back to one box per shop area derived from positions, flagged; still confirmable.
- **Offline correctness:** all gates/selectors are pure and run locally; backend POSTs stay best-effort/non-fatal as today.

## 9. Acceptance

- Home is a prio-sorted, fully selectable Beleg list; no "Paket X von Y", no forced order; assignment is system-only.
- A Beleg with multiple positions and multiple SKU lines works end-to-end.
- Scan mismatch cannot advance.
- Box-sort step exists; Hängeware uses its own close path.
- Open problem blocks ZST; Teilabschluss works.
- Forced-order code is deleted; tests ≥80%; typecheck + lint clean.
