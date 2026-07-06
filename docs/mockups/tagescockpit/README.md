# Tagescockpit — Redesign: Mockups & Recommendation

Context: `apps/teamlead-web/src/features/cockpit/CockpitPage.tsx` is the teamlead-web index route
(`/`). The current screen was flagged as poor UX — questionable whether it's needed at all. This
folder documents the audit, three mockup directions, and the decision that was implemented.

## 0. Audit — why the current Tagescockpit is weak

Reading `CockpitPage.tsx` and the surrounding data layer (`data/store.tsx`, `data/types.ts`) plus
`MitarbeiterBoard.tsx` and `AblagenBoard.tsx`:

- **Vanity KPIs, not decisions.** Capacity (5 cards), Pool (5 cards) and ZST (5 cards) — 15 metric
  cards render every load, most of which don't change what the teamlead does next. "Aufwandspunkte",
  "Teile/h" belong in a report, not a daily action screen.
- **Redundant with the Mitarbeiterboard.** The board already shows per-employee idle status
  (`bundleId` undefined), bundle status, `utilisationPct`, and an open-issues chip per row. The
  cockpit's "Probleme offen" and "ausgelastet ≥ 90%" exception text just restates board data one
  level up, with no link to *which* employee.
- **Redundant with Digitale Ablagen.** The `probleme` and `geparkt` lanes already are the queues for
  exactly the cases the cockpit's exception bar gestures at ("Braucht dich"). The cockpit doesn't
  read lane data at all today, so its warning text and the actual actionable queue are two
  disconnected surfaces.
- **The Automatik toggle and "Neu berechnen" are the only things with no other home.** Everything
  else on the page either duplicates the board/ablagen or is a passive metric.
- **No sense of trend.** It's a snapshot: is 26 open cases in the pool good or bad two hours before
  shift end? The screen can't say.

What a teamlead actually needs at a glance: *is the Automatik running*, *is the pool draining or
piling up*, *what specifically needs a human* (not "3 problems" — which 3, click to act), *who is
idle right now*, and a one-click way to force a recalculation.

## 1. Three directions

All three are self-contained HTML mockups in this folder — open directly in a browser, no build
step. They're light/dark-aware for review purposes only (see "Dark mode" note below — the real app
stays light-only).

| File | Direction | Concept |
|---|---|---|
| `a-steuerzentrale.html` | **A — Steuerzentrale** | Keep a dedicated screen, but every element is a decision or a live status, never a passive metric. Health bar (verteilt / pool-rest / blockiert), a "Braucht dich jetzt" list of concrete clickable cases, a short idle-employee strip, one prominent recalc button. |
| `b-merge-remove.html` | **B — Merge/Remove** | Delete the tab entirely. Fold Automatik toggle + plan status + an exception count into a slim global status bar shown on every page; fold the idle-employee strip into the Mitarbeiterboard header. Shows the app with the nav item struck through. |
| `c-dispo-timeline.html` | **C — Dispo-Timeline (hybrid)** | Most ambitious: replace the snapshot with a shift-long timeline (pool size over time, recalculation events, blocking incidents) plus a per-employee availability Gantt strip and a "pool empty by HH:MM" forecast. Directly answers "will this clear before shift end", which no other view can. |

### Trade-offs

- **A** is low migration risk (same route, same IA), fixes the actual complaint (every element
  becomes actionable), and is buildable entirely from data the frontend already has in
  `useCockpitData()` (`cockpit`, `board`, `lanes`). Cost: still "a tab", so it only pays off if every
  element genuinely earns its place — a half-hearted redesign regresses to the same problem.
- **B** removes a screen entirely, which is appealing given how much of today's content duplicates
  the board/ablagen — but it also removes the one "is today going well" landing view, spreads
  Automatik controls into a bar most teamleads will stop consciously reading (banner blindness), and
  turns "Neu berechnen" into a UI element with no dedicated home.
- **C** is the most genuinely novel idea (temporal framing beats a snapshot) but needs data the
  backend doesn't persist today — a real per-tick pool-size history and a per-event recalculation
  log line up to a timeline. Building it honestly (not with mock data) is a separate, larger backend
  task: sampling/retention of pool size over the shift, and exposing the historical recalc list with
  timestamps beyond the last-8 audit feed. Out of scope for this pass.

## 2. Recommendation: **Direction A**, implemented for real

**Keep the dedicated screen, rebuilt as a control center — not a merge, not a removal.**

Reasoning tied to the teamlead's actual job:
- The index route is the natural "is today fine" landing check; removing it (B) trades a real,
  distinct concern (aggregate today-health) for a thinner always-on status bar that risks becoming
  wallpaper.
- All of A's redesigned content is derivable **today**, with **zero backend/DTO changes**, from data
  `useCockpitData()` already fetches:
  - Health bar: `verteilt = zst.totalCases − pool.openCases`, `pool-rest = pool.openCases`,
    `blockiert = pool.openIssues` (all existing `CockpitSummary` fields).
  - "Braucht dich": `lanes.find(l => l.id === 'probleme')` (Probleme), `'geparkt'` (Topf / aus
    Automatik ausgeschlossen), cards with `deliveryGroup && missingCount > 0 && !released &&
    !locked` (unvollständige Lieferungen) — `lanes: Lane[]` is already part of `CockpitApi`, just
    unused by the old `CockpitPage`. Plus `capacity.freeCapacityMinutes <= 0` (überbucht) and
    `board` rows with `utilisationPct >= 90` (ausgelastet), and the existing `pool.endOfShiftOpen`
    alert.
  - Idle strip: `board` rows with `bundleId === undefined`.
- C's timeline is the more inspired idea long-term, but honestly implementing it needs new backend
  history-tracking. Flagging it as a **future iteration** once pool-size sampling exists, rather than
  building it now against fabricated history data.
- B's "remove the tab" instinct is worth keeping as the fallback if, after A ships, teamleads still
  don't open the tab — the global-status-bar sketch in `b-merge-remove.html` stays valid reference
  for that follow-up.

### Migration implications

- **Nav**: unchanged — `AppShell.tsx` keeps the `/` → "Tagescockpit" entry; only the page content
  changes.
- **Automatik toggle + "Neu berechnen"**: stay on `CockpitPage`, same `localStorage` persistence key
  and auto-recalculate-on-pool-growth effect — logic untouched, only the surrounding layout changes.
- **`DashboardDto` / OpenAPI**: **no change**. Every number on the redesigned page comes from fields
  the frontend already has; nothing new is added to the backend contract in this pass. If a future
  iteration wants a true per-case "no capacity" count (distinct from the capacity-minutes deficit
  used here), that requires engine work to tag *why* a case is unassignable — explicitly deferred,
  not invented.
- **Removed from the page**: the 15 metric cards for capacity/pool/ZST detail collapse into the
  health bar + a slim ZST progress line; the raw numbers remain inspectable via tooltips /
  the board and ablagen pages, not duplicated as top-level cards.
- **Architecture docs**: `docs/architecture/src/c3-teamlead-web-components.mmd` node for
  `cockpit/CockpitPage` updated to reflect it now also reads `lanes` (previously only `store` in
  general); re-rendered via `./render.sh`.

### Dark mode note

These mockup files include dark-mode CSS for reviewability, but the real `teamlead-web` app has no
dark theme today (`packages/ui/src/theme/theme.ts` is light-only, `palette.mode: 'light'`
hardcoded). The real implementation stays light-only, consistent with the rest of the app — adding
dark mode app-wide is a separate, unrelated decision.
