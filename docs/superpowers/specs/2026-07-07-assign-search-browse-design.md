# Beleg search + browse in the assign flow — design

**Date:** 2026-07-07
**Branch:** `feat/assign-search-browse` (new, off latest `main`)

## Problem

`AssignDialog` (apps/teamlead-web) and its backend counterpart currently require an
**exact** WE-Belegnummer. A near miss just yields "Kein Beleg mit dieser
WE-Belegnummer gefunden." — unforgiving, slow, and gives the teamlead no way to find
the right Beleg without already knowing its exact number.

This builds directly on the recent assign rework (WE-Nr input + plausibility, Grund
optional, bundle-create/"Bündel-Warenkorb", unified actions) — none of that is
replaced. The fast exact-entry path (`GET /api/teamlead/cases/lookup`) keeps working
exactly as today; search and browse are added on top of it.

## Backend: `GET /api/teamlead/cases/search`

New endpoint on `TeamleadController` / `TeamleadReadService`, separate from both
`/cases` (the full Belege list, all lifecycle scopes, paginated) and `/cases/lookup`
(exact WE-Nr, single result, assignability verdict). This one is a **bounded,
ranked, assignable-only** search feed for the autocomplete and browse UI.

```
GET /api/teamlead/cases/search
  ?q=<string>            optional, matches weBelegNo / deliveryNoteNo /
                          storageLocation.code / primaryShopNo / branchNo
                          (case-insensitive contains — reuses poolWhere's OR pattern)
  &bereich=<string>       optional, same semantics as PoolQueryDto.bereich
  &shopNo=<string>        optional, same semantics as PoolQueryDto.shopNo
  &branchNo=<string>      optional, same semantics as PoolQueryDto.branchNo
  &limit=<number>         optional, default 20, max 50
```

- **Hard scope**: `status = 'ready' AND assignedBundleId IS NULL`. No `scope` param —
  unlike the general Belege list, this endpoint only ever returns assignable work.
- **Ranking** (JS, post-query — matches this codebase's existing pattern of pure
  functions over a bounded Prisma result set, e.g. `aggregateKpiTotals`,
  `detectDeliveryGroups`): fetch a candidate set bounded by `limit * 3` (capped at
  150) using the existing contains-based `OR` filter, then sort into tiers:
  1. exact `weBelegNo` match (case-insensitive)
  2. `weBelegNo` starts-with `q`
  3. `weBelegNo` contains `q`
  4. match on any other field (deliveryNoteNo / storageLocation.code / primaryShopNo
     / branchNo)
  Within each tier, sort by `bookingDate asc` (oldest/most-overdue first) as a
  deterministic tie-break. Truncate to `limit` after ranking.
- With no `q` (browse mode, filters only): skip ranking, sort by `bookingDate asc`.
- Response: `CaseSearchResultDto[]` — a new DTO carrying exactly what the dialog
  needs to render a result row and feed the existing selection tray: `caseId`,
  `weBelegNo`, `bereich`, `goodsType`, `teile` (totalQuantity), `estimatedMinutes`,
  `storageLocationCode`, `priorityFlags`, `deliveryGroup` (reuse
  `DeliveryGroupRefDto`). No `status`/`assignedEmployeeName` fields — the scope
  already guarantees ready+unassigned, so the dialog doesn't need to ask "why not."

`poolWhere`'s `q` OR-clause is extracted into a small shared helper (or the search
service calls a slightly parameterized version) so both `/cases` and
`/cases/search` stay in sync without duplicating the Prisma where-clause; the
search endpoint adds `deliveryNoteNo` iLike matching that today's `q` filter already
has, so no new field wiring is needed there. The `bereich → LocationKind[]`
translation is reused unchanged.

## Frontend: `AssignDialog.tsx`

### A. Autocomplete (replaces the plain WE-Nr `TextField`)

- The WE-Nr field becomes a live-search combobox. Same 350ms debounce as today.
- Two queries run off the debounced term:
  1. **Exact-match verdict** (existing `lookupBeleg` / `/cases/lookup`) — unchanged,
     still renders its existing plausibility Alert/Paper (not_found /
     already_assigned / wrong_status / blocked / assignable-card) exactly as today,
     immediately above the dropdown.
  2. **Search results** (new `searchAssignableCases` / `/cases/search?q=...`),
     scoped to `row.bereiche` unless the browse drawer's "alle Bereiche" toggle is
     on (shared state — see below).
- Search results render as a dropdown Paper panel below the field: up to ~8 compact
  rows reusing the existing chip vocabulary (WE-Nr bold, Bereich `Chip`, Teile
  `Chip`, `LieferungChip`, a small priority icon when `priorityFlags.length > 0`).
  Not MUI `Autocomplete` — a custom list so it matches the dialog's existing visual
  language.
- Keyboard: Up/Down highlights a row, Enter adds the highlighted row (or the sole
  exact match if the dropdown is empty but the verdict card is assignable — same
  behavior as today's Enter-to-add), Escape closes the dropdown. Click also adds.
- Selecting a row clears the input and dropdown, exactly like today's
  `addToSelection`.
- No-match state: today's `not_found` message stays, with an added line pointing at
  the dropdown/browse drawer when at least one near-miss exists ("Ähnliche Belege
  siehe Liste unten" / falls back silently if the dropdown is also empty).

### B. Browse drawer

- A text link below the field — "Durchsuchen & mehrere auswählen" — expands an
  in-dialog drawer (dialog grows; collapses back when toggled off or after bulk-add).
- Filter bar inside the drawer: Bereich chips (multi-select, defaults to
  `row.bereiche` pre-checked; an "alle Bereiche" chip clears the restriction — this
  is the SAME toggle the autocomplete honors), Shop/Filiale text inputs, a sort
  toggle (Teile ↓ / Priorität / Ältestes zuerst — client-side re-sort of the fetched
  page, no new backend sort param needed since results are already bounded).
- Results list: same compact row rendering as the autocomplete dropdown, but each
  row has a checkbox instead of being directly clickable. Capped at ~20 rows
  visible; if the backend's bounded limit (bumped to `limit=50` while the drawer is
  open) is hit, a "mehr laden" affordance is out of scope for v1 (bounded search is
  intentional — see Non-goals) — a small caption notes when the list may be
  truncated ("weitere Treffer vorhanden, Filter verfeinern").
- Sticky drawer header: `{row.displayName} · {freeMinutes} frei` plus a running
  total of checked Teile/Minuten, reusing the existing `overCapacity` warning style
  once the checked total exceeds free capacity.
- Skill-tier badge (informational only, shown once near the drawer header, not
  per-row): when `row.skillTier` is starter/dummy, a small note confirms "manuelle
  Zuteilung passend" — no gating, no new suitability model.
- Sticky bottom bar: "N ausgewählt · X Teile — Auswahl übernehmen" bulk-adds every
  checked row into the SAME shared `selected` tray state the autocomplete path
  writes to, then collapses the drawer and clears the checkboxes.

### Shared state

Both entry points (autocomplete dropdown, browse drawer) write into the existing
`selected: BelegLookup[]` tray state — reusing the current type by mapping
`CaseSearchResultDto` rows onto the same shape the tray already expects (mirrors
how `BelegLookup` is already assembled from `CaseLookupResultDto` today). The rest
of the dialog (tray list, Teile/Minuten totals, capacity warning, Grund field,
confirm button, bundle-create vs append copy) is untouched.

## Non-goals / explicitly out of scope

- No pagination on `/cases/search` — it is a bounded live-search/browse feed, not
  the full Belege table (that's what `/cases` + the Belege screen are for).
- No new Beleg-difficulty/suitability model for skill tiers — B2's tier note is
  informational only, per the earlier scoping decision.
- No change to `/cases/lookup`, `assignToEmployee`, `assignBundleToEmployee`, or any
  other existing assign/bundle-create endpoint — this is purely additive on the
  discovery side.

## Testing

- **Backend (int)**: ranking order (exact > startsWith > contains > other-field
  match, with bookingDate tie-break); assignable-only scope (excludes
  in_progress/assigned/blocked/etc. and already-assigned ready cases — there should
  be none, since assignedBundleId≠null implies non-ready in practice, but the test
  documents the invariant); bereich filter narrows correctly; limit is honored and
  capped at 50 even if a caller requests more.
- **Frontend**: `AssignDialog` component tests — typing populates the ranked
  dropdown; selecting a dropdown row adds it to the tray; the exact-match verdict
  path (today's not_found/already_assigned/etc. messaging) still renders
  standalone and unaffected; opening the browse drawer, checking multiple rows, and
  "Auswahl übernehmen" adds all of them to the tray in one action.

## Docs

- `docs/architecture/src/c3-teamlead-web-components.mmd` — reflect the
  search/browse addition to `AssignDialog`.
- `docs/architecture/src/c3-backend-components.mmd` — new `/cases/search` endpoint
  on `TeamleadController`/`TeamleadReadService`.
- Re-render via `docs/architecture/render.sh`.
- `docs/handbook/` — update the Mitarbeiterboard/assign chapter if it documents the
  current WE-Nr-only flow.

## Quality gate

- Fast exact-WE-Nr entry still works and is instant (verified by keeping
  `lookupBeleg`/`/cases/lookup` untouched and covered by existing tests).
- No regression to plausibility messaging, Grund-optional, self-assign, or
  skill-tier logic.
- `pnpm typecheck` stays 13/13 green.
- New int tests for `/cases/search` (ranking, scope, bereich filter).
- Dialog stays visually compact — verified by browser check (drawer collapsed by
  default; only grows when explicitly opened).
- `docs/architecture` diagrams updated + re-rendered in the same change set.
- Conventional Commits throughout.
