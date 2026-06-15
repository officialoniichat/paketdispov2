# Reserve & Starterpaket — Concept

> A fully-thought-out model for the eiserne Reserve and the morning Starterpaket, grounded in
> the IST-Prozess. Replaces the current crude implementation. Status: concept, no code yet.

## 1. The problem today ("just shoved")

The current implementation conflates **three different things** all loosely called "Reserve":

| What the code/UI shows | What it actually is | Where |
|---|---|---|
| Cockpit tile "Reserve 17h 28min" | **freie Kapazität** = `netCapacity − planned` (idle time) | `CapacityDto.reserveMinutes`, selectors |
| Engine `reserve.minutes` | **eiserne Reserve** = work deliberately held back for tomorrow | `reserve.ts` `computeIronReserve` |
| `fromPreviousDays` / `starterMinutes` | **Starterpaket** = the morning bundle built from carryover | `types.ts:52-53`, never assembled |

Other weaknesses:
- Reserve is a **flat heuristic**: `max(20% × nextMorningCapacity, 60 min × employees)` — not tied to the real morning gap or to how much backlog already exists.
- `nextMorningCapacityMinutes` is an **optional input we rarely have** → reserve silently collapses to the arbitrary 60 min/employee floor.
- Reserve is only a **minutes number** — it never selects *which* belege are held, and the **Starterpaket is never constructed** (no per-worker morning package).
- There is **no two-day timeline model**, yet reserve is inherently "today's leftover → tomorrow's start."

## 2. Why it exists (IST grounding)

> "Jeden Morgen (Frühschicht ab 9 Uhr) erhalten die Mitarbeitenden ein 'Starterpaket' an Belegen
> von den vergangenen Tagen … oft zum Arbeitsbeginn sind die Anlieferer noch nicht dagewesen,
> d.h. es wurden auch keine neuen Belege gebucht."

Two facts drive everything:
1. **Morning gap:** at shift start there is little/no *fresh* work — deliveries arrive and get booked later in the morning. So the early shift must run on **carryover** from previous days.
2. **Carryover must be deliberately ensured.** If yesterday's team cleared everything, the morning is empty. So the system must **hold back enough suitable work** = the **eiserne Reserve**.

So: **eiserne Reserve (end of day) = the cause; Starterpaket (start of day) = the effect.**

## 3. Terminology — fix the overload (three distinct concepts)

- **Freie Kapazität** = `net − planned`. Idle headroom. Rename the cockpit tile to **"Freie Kapazität"** so it stops masquerading as the reserve.
- **Eiserne Reserve** = a *floor* of startable work intentionally carried into the next morning.
- **Starterpaket** = the concrete morning assignment each early worker receives from the carryover pool.

## 4. The carryover timeline model (the missing piece)

```
  Day D (Spätschicht plans)                Day D+1 (Frühschicht 09:00)
  ──────────────────────────               ──────────────────────────
  pool = ready cases                        pool = carryover (unfinished/held from D)
  assign up to capacity                      + anything booked overnight (usually little)
  leftover (beyond capacity)  ─────────────▶ STARTERPAKET built from this carryover
  + eiserne Reserve floor held ────────────▶ guarantees the pool isn't empty at 09:00
```

Carryover is **automatic** — any `ready` beleg survives to the next cycle. The eiserne Reserve is
therefore only a safety **FLOOR**: it matters *only when the day would otherwise drain the pool
below what the morning needs*. If the natural backlog already exceeds the floor, reserve is a
**no-op**. This is the biggest correction vs. today's "always hold 20%."

## 5. Eiserne Reserve — the proper model

**Purpose:** guarantee at least `R` minutes of *startable, non-urgent* work at next morning's start.

**Sizing (replace the flat 20%):** `R = earlyShiftWorkerCount × morningGapMinutes`
- `morningGapMinutes` = window from shift-start until fresh belege are booked (config; e.g. 90–120 min).
- `earlyShiftWorkerCount` from tomorrow's PEP if available; else today's early-shift count.
- Cap: `R = min(R, nonUrgentStartableBacklog)`.

**It's a FLOOR, not a quota:** if `projectedEndOfDayBacklog ≥ R`, hold nothing. Only on shortfall do we withhold the gap.

**Selection (which belege held):** least-urgent, safest-to-delay.
1. **Never eligible:** sections NOS(4)/NOS-Nachorder(8)/Extrabestellung(7); flags prio/catman_due/overdue/manual; Verladetag today or tomorrow.
2. **Preferred:** Verladetag far out, no urgency, medium Stückzahl.
3. **Hard rule:** holding overnight must never breach Catmandatum/Verladetag.

**Override:** urgent work is never withheld and may draw the pool below R (today's `canConsumeReserve`).

## 6. Starterpaket — the proper model

At Frühschicht start, build each early worker a starter bundle from the carryover pool:
1. Pool = `ready` carryover (the held reserve is now just part of it).
2. Order: Verladetag asc (+ urgent sections first), then booking FIFO, pack by Stückzahl.
3. Size each starter to `morningGapMinutes` (bridge until fresh work, not the whole day).
4. Tag bundles `origin: 'starter'` for cockpit + KPI distinction.

This is the **first `recalculate` of the day over the carryover pool** with a starter cap + tag.

## 7. Engine integration
- **End-of-day:** `assignWork` gains a reserve-floor step — if `projectedBacklog < R`, withhold the shortfall (least-urgent eligible) as `UnassignedReason='held_in_reserve'`; else hold nothing.
- **Morning:** `assignWork` `mode:'starter'` caps per-bundle minutes at `morningGapMinutes`, tags `starter`.
- Inputs from PEP; absent → today's early-shift proxy + logged assumption (no magic 60).

## 8. Config (replace crude knobs)
```
reserve: { enabled, morningGapMinutes: 105, earlyShiftSource: pep|today_proxy,
           neverReserveSections: [4,7,8], neverReserveFlags: [prio,catman_due,overdue,manual],
           respectDeadlines: true }
starter: { capPerBundleMinutes: 105, order: [verladetag_asc, booking_fifo] }
```

## 9. Cockpit surfacing (disambiguate)
- Rename tile **"Reserve" → "Freie Kapazität"** (`net − planned`).
- New **"Eiserne Reserve"** indicator: target R vs. held, ⚠ when pool can't satisfy R.
- New **"Starterpaket morgen"** preview: belege/minutes queued for the early shift by Verladetag.
- Audit: hold/consume reserve = §8.4 events.

## 10. Edge cases
- Empty pool → R capped to backlog + Leerlauf warning. All-urgent → reserve 0 + warning.
- No PEP → today proxy, logged. Weekend → next working morning. Deadline conflict → force-assign today.

## 11. Open questions
- Tomorrow's PEP available at end-of-day plan time? Real `morningGapMinutes`? Starter pre-built night-before vs at 09:00? "Stückzahl" = parts-count cap vs minutes?
