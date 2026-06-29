# @paket/assignment-engine

Fair, rule-based assignment engine for the digital goods-receipt distribution (EPIC 4).
Pure, framework-free and deterministic — no Fastify, no Prisma, no I/O — so it is fully
unit-testable and the Teamlead **"Neu berechnen" / recalculate** stays reproducible and
well under the **Anhang E.5 budget of < 5 s** for a typical day pool.

It integrates with the rest of the modular monolith **only through the shared
`@paket/domain-types` contract** (parsed `GoodsReceiptCase`s from EPIC 2, `EmployeeShift`,
`AssignmentBundle`, `BundlePickupSequence`, `LocationMaster`). The backend-api
`assignment` / `route` module slots wire this in once EPIC 3 lands.

## Concept anchors

| Concern | Konzept | Module |
|---|---|---|
| SEAK/PEP CSV import (`ShiftImportRow`) | §13.2 | `capacity/shift-import.ts` |
| Net capacity per employee/team | §4.3 | `capacity/net-capacity.ts` |
| Priority classes (Ausschluss→Manuell→Prio→Überfällig→Jeden-Tag 7/4/8→Verladeplan 1/2/3→FIFO) | §8.1 | `priority/priority-engine.ts` |
| Effort points (`EffortInputVector` + effort-rules) | §8.2 / Anhang B.3 | `effort/effort-score.ts` |
| Starter packages, balanced bundles, heavy/light mix | §8.3 / §8.4 | `assignment/bundling.ts` |
| Distribution without specialists | §8.3 / §8.4 | `assignment/distribute.ts` |
| Orchestrator `assignWork(date)` | §8.3 | `assignment/plan.ts` |
| Pickup order **inside a finished bundle** | Anhang D.1–D.8 | `pickup/pickup-order.ts` |

## Leitplanke (Anhang D / H)

Pickup ordering is **not** a route optimisation and **never** an assignment criterion.
`buildPickupSequence` receives an already-decided bundle and only produces the binding
pick order shown in the app (`numeric_fallback` by type+number, or `manual_sort_order`).
It cannot read the pool, so it cannot influence which cases are bundled together.

## Usage

```ts
import { parseShiftImportCsv, toEmployeeShift, assignWork } from '@paket/assignment-engine';

const { rows, warnings } = parseShiftImportCsv(seakCsv);     // §13.2
const shifts = rows.map((r) => toEmployeeShift(r));          // §4.3 net capacity

const plan = assignWork({
  date: '2026-06-16',
  cases,                 // ready GoodsReceiptCases (EPIC 2)
  shifts,
  locations,             // LocationMaster[]
  // optional: effortVectors, pickupProfiles
});
// → plan.bundles, plan.pickupSequences, plan.unassigned, plan.loads, plan.diagnostics
```

`assignWork` is a pure function of its input (pass `options.now` for a deterministic
pickup timestamp), so calling it twice with the same input yields identical bundles —
the property the Teamlead simulation/recalculate relies on.

## Open points (carried from discovery)

- **Net capacity** uses `(plannedEnd−plannedStart) − breakMinutes × productivityFactor`
  (default `1.0`); the IST-hours vs. brutto/netto definition is unverified (discovery #63).
- **`employeeNo` → employee id** mapping is injectable (`resolveEmployeeId`); unverified (#59).
- **`effortPoints = minutes × pointsPerMinute`** (default `1`); calibration is a later phase.

All rule parameters (B.3 effort, bundling/capacity tuning) are config-driven
via `DEFAULT_ENGINE_CONFIG` and the exported Zod schemas, ready for Admin/Teamlead Regelpflege.
