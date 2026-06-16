# Status-Flow & Action-Path Map — every path, every gap

**Date:** 2026-06-16
**Scope:** The 10-status case machine (post-cleanup) vs. the action surface that drives it (teamlead `caseActions` + employee PWA + engine). Maps **every transition**, who triggers it, whether it's wired, and **where the UI offers an action that shouldn't exist, or is missing one that should** — incl. the „Priorisieren is still there after prioritising" problem.
**Method:** grounded in the live code — `caseActions.ts` AVAILABILITY, `case-status.ts` CASE_TRANSITIONS, `teamlead.service.ts` (prioritize), PWA endpoints. No code change here; this is the gap register.

---

## 0 · The core design flaw (one sentence)

**Action availability is keyed on `status` alone** (`caseActions(status)`), but several actions depend on *more than status* — priority flags, pool-membership, issue presence. That mismatch is the root cause of every „phantom action" below (an action that shows but does nothing useful) and of the missing toggles.

---

## 1 · The 10 states (with phase grouping)

| Phase | Status | Meaning |
|---|---|---|
| Eingang | `needs_review` | Parser/ProHandel unsure — human check |
| Pool | `ready` · `parked` | Plannable / held back |
| In Arbeit | `assigned` · `in_progress` · `issue_open` | In a bundle / employee working / blocked by problem |
| Abgeschlossen | `partially_completed` · `completed` | Teil gebucht / fertig |
| Erledigt | `zst_done` · `cancelled` | Exportiert / storniert (terminal) |

---

## 2 · Full transition graph — every edge, trigger, actor, wired?

| From → To | Trigger (action) | Actor | Wired? | Notes / gap |
|---|---|---|---|---|
| needs_review → ready | **— none —** | TL | ❌ **MISSING** | No „freigeben/approve" action. needs_review can only be parked/cancelled → **dead-end**. |
| needs_review → cancelled | Stornieren | TL | ✅ | |
| ready → assigned | Verteilen / Hinzufügen | Engine/TL | ✅ | cockpit recalculate / board add-to-bundle |
| ready → parked | Parken | TL | ✅ | |
| ready → cancelled | Stornieren | TL | ✅ | |
| parked → ready | Entparken | TL | ✅ | |
| parked → cancelled | Stornieren | TL | ✅ | |
| assigned → in_progress | Start (Lagerplatz scannen) | MA | ✅ | PWA `start-preparation` |
| assigned → ready | Entziehen (Bündel) | TL | ⚠️ Board only | not offered from Belege/Ablagen (bundle-scoped) |
| assigned → cancelled | Stornieren | TL | ✅ | ⚠️ does cancel also unlink the bundle? (verify — orphan risk) |
| in_progress → completed | ZST/Abschluss | MA | ✅ | PWA |
| in_progress → partially_completed | Teilabschluss | MA | ✅ | PWA |
| in_progress → issue_open | Problem melden | MA | ✅ | PWA |
| in_progress → cancelled | **— none —** | TL | ❌ **dead edge** | machine allows abort, UI never offers it |
| issue_open → in_progress | Problem freigeben | TL | ✅ | case-scoped resolve |
| issue_open → cancelled | **— none —** | TL | ❌ **dead edge** | unresolvable problem can't be cancelled |
| partially_completed → ready | Rest-Carry-over | ??? | ❌ **MISSING trigger** | no action, no scheduler — partial case is **stuck** |
| partially_completed → completed | **— none —** | ? | ❌ **dead edge** | how a partial becomes fully done is undefined |
| partially_completed → cancelled | **— none —** | TL | ❌ **dead edge** | |
| completed → zst_done | Tagesabschluss/Export | TL | ✅ | day-level batch (Belege „Abgeschlossen" scope) |
| completed → cancelled | **— none —** | — | ❌ **dead edge** | probably correct to never allow (already booked) → prune |
| zst_done / cancelled | terminal | — | ✅ | |

**Tally:** 13 wired transitions · 1 board-only · **6 dead edges** (machine allows, nothing triggers) · **2 genuinely missing paths** (needs_review→ready, partial carry-over).

---

## 3 · Action × status availability — offered vs. sensible

Current `caseActions(status)` (teamlead):

| Status | Offered now | Should offer | Phantom / missing |
|---|---|---|---|
| needs_review | park, **prioritise**, cancel | **freigeben→ready**, park, cancel | ➕ missing *Freigeben*; ⚠ prioritise here = the case isn't in the planning pool yet |
| ready | park, prioritise*, cancel | park, prioritise/de-prioritise, cancel | ⚠ prioritise idempotent (see §4) |
| parked | unpark, prioritise*, cancel | unpark, (de)prioritise, cancel | ⚠ same |
| assigned | **prioritise**, cancel | (Entziehen), cancel | ❌ **prioritise on assigned = no-op** (case already out of pool, in a bundle) |
| in_progress | **prioritise** | (nothing, or emergency-abort) | ❌ **prioritise on in_progress = no-op**; abort missing |
| issue_open | resolve_issue, **prioritise** | resolve_issue, (cancel?) | ❌ prioritise no-op; cancel missing |
| partially_completed | **— none —** | **Rest reaktivieren** | ➕ missing carry-over trigger |
| completed | — none — | (export is batch) | ✅ correct |
| zst_done / cancelled | — none — | — | ✅ correct |

\* prioritise is offered but its effect (a pool-ordering flag) only matters for `ready`/`parked`/`needs_review` — on `assigned`/`in_progress`/`issue_open` the case is already out of the pool, so the flag does nothing.

---

## 4 · The „Priorisieren is still there" problem (your example), dissected

`teamlead.service.prioritize` does `flags.add('manual_teamlead_priority')` — a **Set add**. Consequences:

1. **Idempotent no-op:** clicking Priorisieren on an already-prioritised case changes nothing — but still **writes a `case.prioritized` audit event + bumps version** → audit noise, false „action taken".
2. **No un-prioritise:** there is no way to *remove* `manual_teamlead_priority`. Once prioritised, always prioritised.
3. **Shown where it has no effect:** offered on `assigned`/`in_progress`/`issue_open`, where the case is out of the planning pool so the flag is inert.

**Why:** availability is `status`-only, so it can't see „already has the flag" or „not in the pool".

**Fix (the pattern for all flag-dependent actions):** make availability take the **case** (`status` + `priorityFlags`), not just status:
- `prioritise` available only on pool states (`ready`,`parked`,`needs_review`) **and** when `manual_teamlead_priority` is NOT set.
- add `deprioritise` („Priorität entfernen") available on those states when it **IS** set (needs a backend remove-flag path).
- one toggle in the UI: Priorisieren ⇄ Priorität entfernen.

---

## 5 · Missing paths (must add or the flow has dead-ends)

| # | Missing | Why it matters | Recommendation |
|---|---|---|---|
| M1 | **needs_review → ready** (Freigeben) | needs_review cases can never enter the pool → stuck | Add a teamlead `approve` action (`needs_review→ready`, `case.ready`). **OR**, since ProHandel lands cases in `ready` directly (system-of-record), decide whether `needs_review` is even still produced — if not, **cut the status** (10→9) instead of wiring approve. |
| M2 | **partially_completed → ready** (Rest reaktivieren) + remaining-qty | the „rest goes to next day" (§4.6) has no trigger and no remaining-quantity field → partial cases are stuck and the rest is lost | Add „Rest reaktivieren" (manual) or an automatic day-rollover; track `remainingQuantity` (see `beleg-lifecycle-completion-concept.md`). Depends on the Teilabschluss-quantity fix (still books 0 — see critical review F2). |
| M3 | **de-prioritise** | no way to undo a manual priority | add remove-flag action (see §4) |

---

## 6 · Dead edges (machine allows, nothing triggers) — prune or wire

Decide per edge: either add the action, or **remove the edge from `CASE_TRANSITIONS`** so the machine = reality (no aspirational edges).

| Edge | Decision |
|---|---|
| in_progress → cancelled | **Add** an emergency „Abbrechen" (TL) **or prune**. (Recommend: add — goods can be pulled mid-work.) Cancelling must also detach the bundle. |
| issue_open → cancelled | **Add** „Stornieren" on a problem case (unresolvable problem) **or prune**. (Recommend: add.) |
| partially_completed → completed | Define: does a teamlead mark the rest written-off? If not, **prune** (the rest comes back via →ready then normal complete). |
| partially_completed → cancelled | **Prune** unless storno of a partial is real. |
| completed → cancelled | **Prune** — a booked, completed case should not be cancellable. |

---

## 7 · Consistency notes

- **Cancel is offered on `needs_review/ready/parked/assigned` only** (storno-before-work). That's a deliberate, sensible restriction — but the **machine allows cancel from every non-terminal state**, so the machine and the UI diverge. Align them (either widen the UI per §6 or narrow the machine).
- **Entziehen (assigned→ready)** lives only on the Board (bundle ctx), not in `caseActions`. Acceptable (assigned cases aren't pool residents), but a teamlead opening an `assigned` Beleg detail can't unassign it there. Consider surfacing it via the registry with a bundle-ctx guard.
- **`assigned → cancelled`**: confirm `cancel` also clears `assignedBundleId` (else the bundle keeps a cancelled case). Likely a bug.

---

## 8 · The fix, in priority order (lean)

1. **Make `caseActions` take the case, not just status** (status + priorityFlags + bundle/issue context). This single change enables §4 (prioritise toggle, pool-only) and removes every phantom action. *(frontend + a small backend remove-flag endpoint)*
2. **Prioritise → pool-states only + de-prioritise toggle** (your example).
3. **needs_review: add Freigeben→ready, OR cut the status** (tie to ProHandel ingestion decision).
4. **Reconcile dead edges (§6):** add cancel/abort to in_progress + issue_open; prune the rest so `CASE_TRANSITIONS` has zero unreachable edges.
5. **partially_completed carry-over** (Rest reaktivieren + remaining qty) — after the Teilabschluss-quantity fix.

> Net principle: **every edge in `CASE_TRANSITIONS` has exactly one trigger, and every offered action maps to a legal, *effectful* edge for that exact case** — no idempotent no-ops, no inert flags, no dead edges.
