# Mitarbeiter-App Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the forced single-bundle / fixed-order Mitarbeiter-App flow with a priority-sorted, freely-selectable Beleg list (system-only assignment), and make the per-Beleg flow correct: validating scan, dynamic multi-position/multi-SKU, a real box-sort step, and a completion gate that blocks ZST on open problems.

**Architecture:** Evolve the existing PWA (flat routes + pure `workflowModel.ts` reducers + `useCaseFlow` binding + Dexie store). Replace the `bundles`/`AssignedBundle`/`PickupStop` model with a `day` (DayContext) + `belege` (BelegListItem[]) store; sorting and "next recommended" are pure selectors. Delete forced-order code outright (no compat shims).

**Tech Stack:** React 19, react-router-dom 7, MUI v6, Dexie 4 + dexie-react-hooks, Vitest 2 + fake-indexeddb, `@paket/domain-types` (zod), `@paket/api-client` (openapi-typescript).

**Spec:** `docs/superpowers/specs/2026-06-16-mitarbeiter-app-rework-design.md`
**Mockups:** `docs/concept/mitarbeiter-app-ux-mockups.html`

**Conventions for every task:**
- Test command (single file): `pnpm --filter @paket/employee-pwa exec vitest run <path>`
- Full suite: `pnpm --filter @paket/employee-pwa test`
- Typecheck: `pnpm --filter @paket/employee-pwa typecheck`
- Lint: `pnpm --filter @paket/employee-pwa lint`
- Work on branch `feat/mitarbeiter-app-rework`.
- Do NOT auto-fix NestJS-style import-type lint warnings elsewhere; scope edits to `apps/employee-pwa`.

---

## File Structure

**New files**
- `apps/employee-pwa/src/workflow/belegList.ts` — pure selectors: sort, next-recommended, status derivation.
- `apps/employee-pwa/src/workflow/belegList.test.ts`
- `apps/employee-pwa/src/screens/BelegListeScreen.tsx` — home hub (day context + selectable prio list).
- `apps/employee-pwa/src/screens/BoxenSortierenScreen.tsx` — box-sort confirm step.

**Modified**
- `apps/employee-pwa/src/db/types.ts` — `DayContext`, `BelegListItem`, `CaseStep+'sort'`, `CaseProgress`/`BoxProgress` fields; remove `AssignedBundle`,`PickupStop`.
- `apps/employee-pwa/src/db/db.ts` — Dexie v3 (`day`,`belege`; drop `bundles`).
- `apps/employee-pwa/src/db/repository.ts` — `getDay/putDay/getBelege/putBelege`; remove bundle accessors.
- `apps/employee-pwa/src/db/sync.ts` — map day + belege + real SKU lines.
- `apps/employee-pwa/src/db/seed.ts` — offline demo seed for new shape.
- `apps/employee-pwa/src/workflow/workflowModel.ts` — `'sort'` step + transitions, `scanMatches`, gate incl. open issues, `nextBestAction`.
- `apps/employee-pwa/src/workflow/workflowModel.test.ts` — extend.
- `apps/employee-pwa/src/workflow/useCaseFlow.ts` — `confirmBoxAssignment`, `openCarton`, complete→home.
- `apps/employee-pwa/src/routes/paths.ts` — drop `PAKET`; `done`→`TAGESSTART`; `sort` in `WorkStep`.
- `apps/employee-pwa/src/App.tsx` — `/`=hub, add `/case/:id/sort`, remove `/paket`.
- `apps/employee-pwa/src/screens/LagerplatzScanScreen.tsx` — hard-block scan.
- `apps/employee-pwa/src/screens/VorbereitungScreen.tsx` — individual step ticks.
- `apps/employee-pwa/src/screens/PositionScreen.tsx` — route to `sort`; multi-SKU sum (verify dynamic).
- `apps/employee-pwa/src/screens/BoxabschlussScreen.tsx` — Hängeware branch.
- `apps/employee-pwa/src/screens/AbschlussScreen.tsx` — gate incl. open issues + pace + home nav.
- `apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx` — no preselect.

**Deleted**
- `apps/employee-pwa/src/screens/TagesstartScreen.tsx` (merged into hub)
- `apps/employee-pwa/src/screens/PaketReihenfolgeScreen.tsx`

---

## Task 1: Branch

- [ ] **Step 1: Create the feature branch**

Run:
```bash
git checkout -b feat/mitarbeiter-app-rework
```
Expected: switched to a new branch.

---

## Task 2: Data model types

**Files:**
- Modify: `apps/employee-pwa/src/db/types.ts`

- [ ] **Step 1: Rewrite the assignment/progress types** — new full file:

```ts
/**
 * Offline aggregate model for the Mitarbeiter-App (§12.4).
 *
 * The PWA only ever caches *already-assigned* work: the day context, the
 * priority-sorted list of assigned Belege, and the per-case aggregates needed
 * to work each Beleg offline. Assignment is system-only — the worker never
 * self-assigns; he only chooses the order among the assigned Belege.
 */
import type {
  GoodsReceiptCase,
  ReceiptPosition,
  TransportBoxTarget,
  WorkInstructionHeader,
} from '@paket/domain-types';

/** Storage/goods category — drives the close path (Hängeware skips boxing). */
export type GoodsCategory = 'regal' | 'palette' | 'haengeware' | 'mixed';

/** Derived list status for a Beleg row (computed from CaseProgress + issues). */
export type BelegStatus = 'open' | 'in_progress' | 'done' | 'issue';

/** Day-level context shown on the hub header. Single row, id = 'today'. */
export interface DayContext {
  id: 'today';
  employeeName: string;
  workstation: string;
  plannedStart: string;
  plannedEnd: string;
  estimatedMinutes: number;
  /** Verladetag/Abfahrt as 'HH:mm' or ISO date string, display only. */
  verladetag?: string;
}

/** One assigned Beleg as shown in the selectable list (no forced order). */
export interface BelegListItem {
  caseId: string;
  weBelegNo: string;
  /** Lower = higher priority. Used only for the recommended sort order. */
  prioRank: number;
  section: number | null;
  storageLocationCode: string;
  goodsType: GoodsCategory;
  totalQuantity: number;
  /** True when this Beleg carries a same-day priority flag (NOS/Extra). */
  urgent: boolean;
}

/** Everything needed to work one Beleg offline. */
export interface CaseAggregate {
  caseId: string;
  case: GoodsReceiptCase;
  workInstruction: WorkInstructionHeader;
  positions: ReceiptPosition[];
  boxTargets: TransportBoxTarget[];
}

/** Linear per-case workflow steps (Progressive Disclosure, §E.3). */
export type CaseStep = 'pickup' | 'prepare' | 'positions' | 'sort' | 'boxing' | 'complete' | 'done';

export interface BoxProgress {
  boxNo: number;
  /** Positions assigned to this box (seeded from the engine's boxTargets). */
  positionIds: string[];
  labelPrinted: boolean;
  sealed: boolean;
  onConveyor: boolean;
}

/**
 * Mutable per-case progress with an optimistic-locking `version`.
 * Reducers in workflowModel return new progress objects (immutable update);
 * the repository owns the version bump on persist.
 */
export interface CaseProgress {
  caseId: string;
  step: CaseStep;
  pickupConfirmed: boolean;
  /** Vorbereitung: labels printed BEFORE the carton is opened (§9.5, G.2). */
  labelsPrinted: boolean;
  /** Carton opened (individual step, no longer derived from labelsPrinted). */
  cartonOpened: boolean;
  /** Carton opened, filler removed, sorted by article/colour/size. */
  prepared: boolean;
  confirmedPositionIds: string[];
  quantityCheckedPositionIds: string[];
  /** Box-sort step: worker confirmed the engine's position→box mapping. */
  boxAssignmentConfirmed: boolean;
  boxes: BoxProgress[];
  zstDone: boolean;
  partial: boolean;
  version: number;
  updatedAt: string;
}
```

- [ ] **Step 2: Typecheck (expected to fail elsewhere — that's the work list)**

Run: `pnpm --filter @paket/employee-pwa typecheck`
Expected: FAIL — references to `AssignedBundle`/`PickupStop`/`bundleId` in db.ts, repository.ts, sync.ts, seed.ts, workflowModel.ts, screens. Fixed in later tasks. Do not commit yet.

---

## Task 3: Dexie store v3

**Files:**
- Modify: `apps/employee-pwa/src/db/db.ts`

- [ ] **Step 1: Replace the store with day + belege tables**

```ts
/**
 * Dexie/IndexedDB store for the employee app.
 *
 * Holds exactly the already-assigned work: the day context, the assigned Beleg
 * list, case aggregates, per-case progress and a local append-only event log.
 * Assignment is never created here — it requires the server.
 */
import Dexie, { type Table } from 'dexie';
import type { BelegListItem, CaseAggregate, CaseProgress, DayContext } from './types.js';
import type { LocalEvent } from '../events/types.js';

export class PaketDb extends Dexie {
  day!: Table<DayContext, string>;
  belege!: Table<BelegListItem, string>;
  aggregates!: Table<CaseAggregate, string>;
  progress!: Table<CaseProgress, string>;
  events!: Table<LocalEvent, string>;

  constructor(name = 'paket-employee') {
    super(name);
    // v3: dropped the single forced "bundles" table (AssignedBundle/PickupStop)
    // in favour of a day-context row + a selectable Beleg list. Bump required so
    // existing clients re-create the store instead of throwing a SchemaError.
    this.version(3).stores({
      day: 'id',
      belege: 'caseId, prioRank',
      aggregates: 'caseId',
      progress: 'caseId, step',
      events: 'id, createdAt',
    });
  }
}

/** Singleton used by the app; tests construct their own named instance. */
export const db = new PaketDb();
```

- [ ] **Step 2: No commit yet** (store compiles once repository/sync are updated).

---

## Task 4: Beleg-list selectors (pure, TDD)

**Files:**
- Create: `apps/employee-pwa/src/workflow/belegList.ts`
- Test: `apps/employee-pwa/src/workflow/belegList.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { BelegListItem, CaseProgress } from '../db/types.js';
import { deriveBelegStatus, nextRecommended, sortBelege } from './belegList.js';

const item = (over: Partial<BelegListItem>): BelegListItem => ({
  caseId: 'c1',
  weBelegNo: 'WE1',
  prioRank: 10,
  section: null,
  storageLocationCode: 'REG-01',
  goodsType: 'regal',
  totalQuantity: 10,
  urgent: false,
  ...over,
});

const progress = (over: Partial<CaseProgress>): CaseProgress => ({
  caseId: 'c1',
  step: 'pickup',
  pickupConfirmed: false,
  labelsPrinted: false,
  cartonOpened: false,
  prepared: false,
  confirmedPositionIds: [],
  quantityCheckedPositionIds: [],
  boxAssignmentConfirmed: false,
  boxes: [],
  zstDone: false,
  partial: false,
  version: 0,
  updatedAt: '',
  ...over,
});

describe('sortBelege', () => {
  it('orders by prioRank ascending (lower = higher prio)', () => {
    const out = sortBelege([item({ caseId: 'b', prioRank: 5 }), item({ caseId: 'a', prioRank: 1 })]);
    expect(out.map((b) => b.caseId)).toEqual(['a', 'b']);
  });
  it('does not mutate the input array', () => {
    const input = [item({ caseId: 'b', prioRank: 5 }), item({ caseId: 'a', prioRank: 1 })];
    sortBelege(input);
    expect(input.map((b) => b.caseId)).toEqual(['b', 'a']);
  });
});

describe('deriveBelegStatus', () => {
  it('is done when progress step is done', () => {
    expect(deriveBelegStatus(progress({ step: 'done' }), 0)).toBe('done');
  });
  it('is issue when open issues exist and not done', () => {
    expect(deriveBelegStatus(progress({ step: 'positions' }), 1)).toBe('issue');
  });
  it('is in_progress once pickup confirmed', () => {
    expect(deriveBelegStatus(progress({ step: 'prepare', pickupConfirmed: true }), 0)).toBe(
      'in_progress',
    );
  });
  it('is open before any action', () => {
    expect(deriveBelegStatus(undefined, 0)).toBe('open');
  });
});

describe('nextRecommended', () => {
  it('returns the highest-prio Beleg that is not done', () => {
    const belege = [item({ caseId: 'a', prioRank: 1 }), item({ caseId: 'b', prioRank: 2 })];
    const statuses = new Map([
      ['a', 'done' as const],
      ['b', 'open' as const],
    ]);
    expect(nextRecommended(belege, statuses)?.caseId).toBe('b');
  });
  it('returns undefined when all done', () => {
    const belege = [item({ caseId: 'a', prioRank: 1 })];
    const statuses = new Map([['a', 'done' as const]]);
    expect(nextRecommended(belege, statuses)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paket/employee-pwa exec vitest run src/workflow/belegList.test.ts`
Expected: FAIL — `Cannot find module './belegList.js'`.

- [ ] **Step 3: Implement the selectors**

```ts
/**
 * Pure selectors over the assigned Beleg list. No I/O. The list is sorted by
 * priority for display only; the worker may still pick any Beleg (free
 * selection). Status is derived from per-case progress + open-issue count.
 */
import type { BelegListItem, BelegStatus, CaseProgress } from '../db/types.js';

/** Sort by priority (lower prioRank first), then weBelegNo. Returns a new array. */
export function sortBelege(belege: readonly BelegListItem[]): BelegListItem[] {
  return [...belege].sort(
    (a, b) => a.prioRank - b.prioRank || a.weBelegNo.localeCompare(b.weBelegNo),
  );
}

/** Derive the list status from progress and the case's open-issue count. */
export function deriveBelegStatus(
  progress: CaseProgress | undefined,
  openIssues: number,
): BelegStatus {
  if (progress?.step === 'done') return 'done';
  if (openIssues > 0) return 'issue';
  if (progress && progress.pickupConfirmed) return 'in_progress';
  return 'open';
}

/** The recommended next Beleg: highest priority that is not yet done. */
export function nextRecommended(
  belege: readonly BelegListItem[],
  statuses: ReadonlyMap<string, BelegStatus>,
): BelegListItem | undefined {
  return sortBelege(belege).find((b) => statuses.get(b.caseId) !== 'done');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paket/employee-pwa exec vitest run src/workflow/belegList.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/employee-pwa/src/workflow/belegList.ts apps/employee-pwa/src/workflow/belegList.test.ts apps/employee-pwa/src/db/types.ts apps/employee-pwa/src/db/db.ts
git commit -m "feat(pwa): beleg-list selectors + day/belege data model"
```

---

## Task 5: Workflow model — sort step, scan match, gate (TDD)

**Files:**
- Modify: `apps/employee-pwa/src/workflow/workflowModel.ts`
- Modify: `apps/employee-pwa/src/workflow/workflowModel.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `workflowModel.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import {
  canCompleteCase,
  confirmBoxAssignment,
  nextBestAction,
  scanMatches,
} from './workflowModel.js';
import type { CaseAggregate, CaseProgress } from '../db/types.js';

function agg(over: Partial<CaseAggregate> = {}): CaseAggregate {
  return {
    caseId: 'c1',
    case: { storageLocation: { code: 'REG-07' }, weBelegNo: 'WE1' } as CaseAggregate['case'],
    workInstruction: {
      caseId: 'c1',
      priceLabelPrintRequired: true,
      sortByArticleColorSizeRequired: true,
      goodsReceiptCheckMode: 'quantity_only',
      minimumQuantityCheckAlwaysRequired: true,
      boxLabelRequired: true,
      zstRequired: true,
    },
    positions: [
      {
        id: 'p1',
        positionNo: 1,
        skuLines: [{ expectedQuantity: 4 }, { expectedQuantity: 6 }],
      } as CaseAggregate['positions'][number],
    ],
    boxTargets: [],
    ...over,
  };
}

function prog(over: Partial<CaseProgress> = {}): CaseProgress {
  return {
    caseId: 'c1',
    step: 'pickup',
    pickupConfirmed: false,
    labelsPrinted: false,
    cartonOpened: false,
    prepared: false,
    confirmedPositionIds: [],
    quantityCheckedPositionIds: [],
    boxAssignmentConfirmed: false,
    boxes: [{ boxNo: 1, positionIds: ['p1'], labelPrinted: false, sealed: false, onConveyor: false }],
    zstDone: false,
    partial: false,
    version: 0,
    updatedAt: '',
    ...over,
  };
}

describe('scanMatches', () => {
  it('matches ignoring case/whitespace', () => {
    expect(scanMatches(' reg-07 ', 'REG-07')).toBe(true);
  });
  it('rejects a different code', () => {
    expect(scanMatches('REG-09', 'REG-07')).toBe(false);
  });
});

describe('confirmBoxAssignment', () => {
  it('sets the flag and moves to boxing', () => {
    const next = confirmBoxAssignment(prog({ step: 'sort' }));
    expect(next.boxAssignmentConfirmed).toBe(true);
    expect(next.step).toBe('boxing');
  });
});

describe('canCompleteCase with open issues', () => {
  const full = prog({
    confirmedPositionIds: ['p1'],
    quantityCheckedPositionIds: ['p1'],
    boxes: [{ boxNo: 1, positionIds: ['p1'], labelPrinted: true, sealed: true, onConveyor: true }],
  });
  it('passes when everything done and no open issue', () => {
    expect(canCompleteCase(full, agg(), 0).ok).toBe(true);
  });
  it('blocks when an issue is open', () => {
    const gate = canCompleteCase(full, agg(), 1);
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain('Offenes Problem – erst klären');
  });
});

describe('nextBestAction includes sort', () => {
  it('routes to Boxen sortieren after positions confirmed', () => {
    const p = prog({ step: 'positions', confirmedPositionIds: ['p1'], quantityCheckedPositionIds: ['p1'] });
    expect(nextBestAction(p, agg()).step).toBe('sort');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @paket/employee-pwa exec vitest run src/workflow/workflowModel.test.ts`
Expected: FAIL — `scanMatches`/`confirmBoxAssignment` not exported; `canCompleteCase` arity changed.

- [ ] **Step 3: Update `workflowModel.ts`**

1. `STEP_ORDER` — insert `'sort'`:
```ts
const STEP_ORDER: readonly CaseStep[] = [
  'pickup',
  'prepare',
  'positions',
  'sort',
  'boxing',
  'complete',
  'done',
];
```

2. `initialProgress` — drop the `bundleId` param, add new fields, seed box `positionIds`:
```ts
export function initialProgress(aggregate: CaseAggregate, now: string): CaseProgress {
  const boxes: BoxProgress[] = aggregate.boxTargets.map((t, i) => ({
    boxNo: i + 1,
    positionIds: t.positionIds ?? [],
    labelPrinted: false,
    sealed: false,
    onConveyor: false,
  }));
  return {
    caseId: aggregate.caseId,
    step: 'pickup',
    pickupConfirmed: false,
    labelsPrinted: false,
    cartonOpened: false,
    prepared: false,
    confirmedPositionIds: [],
    quantityCheckedPositionIds: [],
    boxAssignmentConfirmed: false,
    boxes,
    zstDone: false,
    partial: false,
    version: 0,
    updatedAt: now,
  };
}
```

3. Add scan-match helper:
```ts
/** True when a scanned code matches the expected storage location (case/space-insensitive). */
export function scanMatches(scanned: string, expected: string): boolean {
  return scanned.trim().toUpperCase() === expected.trim().toUpperCase();
}
```

4. Add carton-open + sort + box-confirm transitions (keep `markPrepared` → `positions`):
```ts
export const openCarton = (p: CaseProgress): CaseProgress => ({ ...p, cartonOpened: true });

export const enterSort = (p: CaseProgress): CaseProgress => ({ ...p, step: 'sort' });

export const confirmBoxAssignment = (p: CaseProgress): CaseProgress => ({
  ...p,
  boxAssignmentConfirmed: true,
  step: 'boxing',
});
```

5. `canCompleteCase` — add an `openIssues` parameter and reason:
```ts
export function canCompleteCase(
  p: CaseProgress,
  aggregate: CaseAggregate,
  openIssues: number,
): CompletionGate {
  const reasons: string[] = [];
  if (!allPositionsConfirmed(p, aggregate.positions)) {
    reasons.push('Nicht alle Positionen geprüft');
  }
  if (
    requiresQuantityCheck(aggregate.workInstruction) &&
    !allQuantitiesChecked(p, aggregate.positions)
  ) {
    reasons.push('Mindest-Stückzahlkontrolle offen');
  }
  if (aggregate.workInstruction.boxLabelRequired && !allBoxesSealed(p)) {
    reasons.push('Nicht alle Boxen verplombt');
  }
  if (openIssues > 0) {
    reasons.push('Offenes Problem – erst klären');
  }
  return { ok: reasons.length === 0, reasons };
}
```

6. `nextBestAction` — insert the sort step:
```ts
    case 'positions': {
      const next = aggregate.positions.find((pos) => !p.confirmedPositionIds.includes(pos.id));
      if (next) return { label: `Position ${next.positionNo} prüfen`, step: 'positions' };
      return { label: 'Boxen sortieren', step: 'sort' };
    }
    case 'sort':
      return { label: 'Sortierung übernehmen', step: 'sort' };
    case 'boxing': {
      const nextBox = p.boxes.find((b) => !b.sealed);
      if (nextBox) return { label: `Box ${nextBox.boxNo} abschließen`, step: 'boxing' };
      return { label: 'Beleg abschließen', step: 'complete' };
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @paket/employee-pwa exec vitest run src/workflow/workflowModel.test.ts`
Expected: PASS. If existing tests called `canCompleteCase(p, agg)` (2 args) or `initialProgress(agg, bundleId, now)`, update those call sites to the new signatures.

- [ ] **Step 5: Commit**

```bash
git add apps/employee-pwa/src/workflow/workflowModel.ts apps/employee-pwa/src/workflow/workflowModel.test.ts
git commit -m "feat(pwa): sort step, scan-match, issue-gated completion in workflow model"
```

---

## Task 6: Repository accessors

**Files:**
- Modify: `apps/employee-pwa/src/db/repository.ts`

- [ ] **Step 1: Replace bundle accessors with day/belege accessors**

Remove `getActiveBundle` and `putBundle`. Change the import: drop `AssignedBundle`, add `BelegListItem, DayContext`. Add:

```ts
export async function getDay(db: PaketDb = defaultDb): Promise<DayContext | undefined> {
  return db.day.get('today');
}

export async function putDay(day: DayContext, db: PaketDb = defaultDb): Promise<void> {
  await db.day.put(day);
}

export async function getBelege(db: PaketDb = defaultDb): Promise<BelegListItem[]> {
  return db.belege.toArray();
}

export async function putBelege(items: BelegListItem[], db: PaketDb = defaultDb): Promise<void> {
  await db.belege.bulkPut(items);
}
```

Keep `getAggregate`, `getProgress`, `putAggregate`, `putProgress`, `reconcileVersion`, `saveProgress`, `OptimisticLockError` unchanged.

- [ ] **Step 2: Typecheck** — repository.ts itself must be clean (failures remain only in sync.ts/seed.ts/screens).

Run: `pnpm --filter @paket/employee-pwa typecheck`

---

## Task 7: Sync mapping (day + belege + real SKU)

**Files:**
- Modify: `apps/employee-pwa/src/db/sync.ts`

- [ ] **Step 1: Rewrite mappers + `loadAssignedWork`**

Update imports: remove `AssignedBundle, PickupStop`; add `BelegListItem, DayContext`; import `putDay, putBelege` from repository; drop `putBundle`. Replace `toPickupStops`/`toAssignedBundle` with:

```ts
function goodsCategory(value: unknown): BelegListItem['goodsType'] {
  if (value === 'palette' || value === 'haengeware' || value === 'mixed' || value === 'regal') {
    return value;
  }
  return 'regal';
}

function prioRankFor(summary: CaseSummaryDto, index: number): number {
  // Same-day sections (NOS=4, Extra=7, NOS-Nachorder=8) rank first; else list order.
  const urgentSections = new Set([4, 7, 8]);
  const urgent = typeof summary.section === 'number' && urgentSections.has(summary.section);
  return (urgent ? 0 : 100) + index;
}

function toBelegList(cases: CaseSummaryDto[]): BelegListItem[] {
  return cases.map((c, i) => ({
    caseId: c.id,
    weBelegNo: c.weBelegNo,
    prioRank: prioRankFor(c, i),
    section: typeof c.section === 'number' ? c.section : null,
    storageLocationCode: c.storageLocationCode,
    goodsType: goodsCategory((c as { goodsType?: unknown }).goodsType),
    urgent: c.priorityFlags.includes('prio') || [4, 7, 8].includes(Number(c.section)),
    totalQuantity: c.totalQuantity,
  }));
}

function toDayContext(bundle: CurrentBundleDto | undefined, employeeName: string): DayContext {
  return {
    id: 'today',
    employeeName,
    workstation: DEFAULT_WORKSTATION,
    plannedStart: DEFAULT_PLANNED_START,
    plannedEnd: DEFAULT_PLANNED_END,
    estimatedMinutes: bundle?.plannedEffortMinutes ?? 0,
  };
}
```

Replace `toPositions` (real SKU lines, no synthesize):
```ts
function toPositions(caseId: string, dtos: ReceiptPositionDto[]): ReceiptPosition[] {
  return dtos.map((dto) => {
    const skuDtos = (dto as { skuLines?: Array<{ id?: string; ean?: string; size?: string; expectedQuantity?: number }> }).skuLines ?? [];
    return {
      id: dto.id,
      caseId,
      positionNo: dto.positionNo,
      wgr: dto.wgr,
      supplierArticleNo: dto.supplierArticleNo,
      supplierColor: dto.supplierColor,
      branchNo: dto.branchNo,
      shopNo: dto.shopNo,
      floor: str(dto.floor),
      instruction: {
        priceLabelRequired: true,
        priceLabelAttachRequired: true,
        securityRequired: false,
        onlineHandlingRequired: false,
      },
      skuLines: skuDtos.map((s, i) => ({
        id: s.id ?? `${dto.id}-sku-${i + 1}`,
        receiptPositionId: dto.id,
        ean: s.ean ?? '',
        size: s.size ?? '',
        expectedQuantity: s.expectedQuantity ?? 0,
        status: 'open' as const,
      })),
      status: positionStatus(dto.status),
    };
  });
}
```

Update `toCaseAggregate` to call `toPositions(caseId, dto.positions)` (drop the totalQuantity arg). Replace `loadAssignedWork`:
```ts
export async function loadAssignedWork(db: PaketDb = defaultDb): Promise<LoadResult> {
  const api = getApiClient();
  const session = getSession();

  const { data: today, error } = await api.GET('/api/me/today');
  if (error || !today) {
    throw new Error('Tagesdaten konnten nicht geladen werden');
  }

  await db.day.clear();
  await db.belege.clear();
  await db.aggregates.clear();

  await putDay(toDayContext(today.bundle ?? undefined, session.displayName), db);

  if (!today.cases.length) {
    return { caseCount: 0 };
  }

  await putBelege(toBelegList(today.cases), db);

  const now = new Date().toISOString();
  for (const summary of today.cases) {
    const { data: aggDto, error: aggErr } = await api.GET('/api/me/cases/{caseId}/aggregate', {
      params: { path: { caseId: summary.id } },
    });
    if (aggErr || !aggDto) continue;
    const aggregate = toCaseAggregate(aggDto);
    await putAggregate(aggregate, db);
    const existing = await db.progress.get(aggregate.caseId);
    if (!existing) {
      await putProgress(initialProgress(aggregate, now), db);
    }
  }

  return { caseCount: today.cases.length };
}
```
Update `LoadResult` to drop `bundleId` (keep `caseCount`).

- [ ] **Step 2: Typecheck** — sync.ts clean; only seed.ts + screens remain.

Run: `pnpm --filter @paket/employee-pwa typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/employee-pwa/src/db/repository.ts apps/employee-pwa/src/db/sync.ts
git commit -m "feat(pwa): day/belege repository + sync with real SKU lines"
```

---

## Task 8: Offline demo seed

**Files:**
- Modify: `apps/employee-pwa/src/db/seed.ts`

- [ ] **Step 1: Update the seed to the new shape**

Read the current `seed.ts`. Replace the bundle seed with: one `DayContext` (`putDay`), a `BelegListItem[]` of ≥3 demo Belege (`putBelege`) — include one `haengeware` and one multi-position case — matching `CaseAggregate`s (`putAggregate`) with **multiple positions and multiple SKU lines** on at least one case, and `initialProgress(aggregate, now)` per case via `putProgress`. Remove any `bundleId`/`pickupStops`. Ensure box targets carry `positionIds`.

- [ ] **Step 2: Typecheck** — seed.ts clean; only screens remain.

Run: `pnpm --filter @paket/employee-pwa typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/employee-pwa/src/db/seed.ts
git commit -m "chore(pwa): offline demo seed for day/belege + multi-position case"
```

---

## Task 9: Routes & paths

**Files:**
- Modify: `apps/employee-pwa/src/routes/paths.ts`
- Modify: `apps/employee-pwa/src/App.tsx`

- [ ] **Step 1: Update paths.ts**

```ts
/** Central route helpers so screens and Next-Best-Action share one map. */
import type { CaseStep } from '../db/types.js';

export const TAGESSTART = '/';

export type WorkStep = Exclude<CaseStep, 'done'>;

export function caseStepPath(caseId: string, step: WorkStep): string {
  return `/case/${caseId}/${step}`;
}

export function problemPath(caseId: string): string {
  return `/case/${caseId}/problem`;
}

/** Maps a workflow step to its route; 'done' returns to the Beleg list (home). */
export function routeForStep(caseId: string, step: CaseStep): string {
  return step === 'done' ? TAGESSTART : caseStepPath(caseId, step);
}
```

- [ ] **Step 2: Update App.tsx routes**

Remove `PaketReihenfolgeScreen` + `TagesstartScreen` imports; import `BelegListeScreen` and `BoxenSortierenScreen`. Routes block:
```tsx
        <Route path="/" element={<BelegListeScreen />} />
        <Route path="/case/:caseId/pickup" element={<LagerplatzScanScreen />} />
        <Route path="/case/:caseId/prepare" element={<VorbereitungScreen />} />
        <Route path="/case/:caseId/positions" element={<PositionScreen />} />
        <Route path="/case/:caseId/sort" element={<BoxenSortierenScreen />} />
        <Route path="/case/:caseId/boxing" element={<BoxabschlussScreen />} />
        <Route path="/case/:caseId/complete" element={<AbschlussScreen />} />
        <Route path="/case/:caseId/problem" element={<ProblemMeldenScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
```

- [ ] **Step 3: No commit yet** (screens created next).

---

## Task 10: BelegListeScreen (hub)

**Files:**
- Create: `apps/employee-pwa/src/screens/BelegListeScreen.tsx`
- Delete: `apps/employee-pwa/src/screens/TagesstartScreen.tsx`, `apps/employee-pwa/src/screens/PaketReihenfolgeScreen.tsx`

- [ ] **Step 1: Create the hub screen**

```tsx
/** Home hub: priority-sorted, freely selectable Beleg list (§E.3 task-first). */
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { db } from '../db/db.js';
import { getBelege, getDay } from '../db/repository.js';
import { deriveBelegStatus, nextRecommended, sortBelege } from '../workflow/belegList.js';
import type { BelegStatus } from '../db/types.js';
import { loadAssignedWork } from '../db/sync.js';
import { isBackendEnabled } from '../data/api.js';
import { useBootstrap } from '../data/bootstrapContext.js';
import { caseStepPath } from '../routes/paths.js';

const STATUS_CHIP: Record<BelegStatus, { label: string; color: 'default' | 'primary' | 'success' | 'error' }> = {
  open: { label: 'Offen', color: 'default' },
  in_progress: { label: 'In Arbeit', color: 'primary' },
  done: { label: 'Fertig', color: 'success' },
  issue: { label: 'Problem', color: 'error' },
};

const ICON: Record<string, string> = { regal: '📦', palette: '🟧', haengeware: '👕', mixed: '📦' };

export function BelegListeScreen(): JSX.Element {
  const navigate = useNavigate();
  const { loading } = useBootstrap();
  const day = useLiveQuery(() => getDay(), []);
  const belege = useLiveQuery(() => getBelege(), []);
  const progressRows = useLiveQuery(() => db.progress.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);

  if (loading || day === undefined || belege === undefined || progressRows === undefined) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton count={3} />
      </Box>
    );
  }

  const progressByCase = new Map(progressRows.map((p) => [p.caseId, p]));
  const openIssuesByCase = new Map<string, number>();
  for (const e of events ?? []) {
    if (e.eventType === 'issue.created') {
      openIssuesByCase.set(e.entityId, (openIssuesByCase.get(e.entityId) ?? 0) + 1);
    }
  }
  const statuses = new Map<string, BelegStatus>(
    belege.map((b) => [
      b.caseId,
      deriveBelegStatus(progressByCase.get(b.caseId), openIssuesByCase.get(b.caseId) ?? 0),
    ]),
  );
  const sorted = sortBelege(belege);
  const recommended = nextRecommended(belege, statuses);
  const doneCount = [...statuses.values()].filter((s) => s === 'done').length;
  const allDone = belege.length > 0 && doneCount === belege.length;
  const urgentCount = belege.filter((b) => b.urgent).length;

  const start = (caseId: string): void => {
    const step = progressByCase.get(caseId)?.step ?? 'pickup';
    navigate(caseStepPath(caseId, step === 'done' ? 'complete' : step));
  };

  return (
    <Box sx={{ p: 2, pb: 16 }}>
      <Typography variant="overline" color="text.secondary">
        {belege.length} Belege · nach Prio · du wählst
      </Typography>
      <Typography variant="h1" gutterBottom>
        Guten Morgen{day ? `, ${day.employeeName}` : ''}
      </Typography>
      {day ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack spacing={0.5}>
            <Typography>Arbeitsplatz: {day.workstation}</Typography>
            <Typography>
              {doneCount} von {belege.length} fertig · {urgentCount}× eilig
            </Typography>
          </Stack>
        </Paper>
      ) : null}

      {belege.length === 0 ? (
        <Alert severity="info">Aktuell keine Zuteilung. Sobald die Teamleitung zuteilt, erscheinen deine Belege hier.</Alert>
      ) : null}

      <Stack spacing={1}>
        {sorted.map((b) => {
          const st = statuses.get(b.caseId) ?? 'open';
          const isRec = recommended?.caseId === b.caseId;
          return (
            <Paper
              key={b.caseId}
              variant="outlined"
              onClick={() => start(b.caseId)}
              sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', ...(isRec ? { borderColor: 'secondary.main', boxShadow: 2 } : {}) }}
            >
              <Box sx={{ fontSize: 22 }}>{ICON[b.goodsType] ?? '📦'}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>
                  WE {b.weBelegNo} {b.urgent ? <Chip size="small" color="secondary" label="Eilig" /> : null}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {b.storageLocationCode} · {b.totalQuantity} Teile{isRec ? ' · empfohlen' : ''}
                </Typography>
              </Box>
              <Chip size="small" color={STATUS_CHIP[st].color} label={STATUS_CHIP[st].label} />
            </Paper>
          );
        })}
      </Stack>

      <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, p: 2, bgcolor: 'background.paper', boxShadow: 8 }}>
        {allDone ? (
          <Stack spacing={1}>
            <Alert severity="success">Alle Belege erledigt 🎉</Alert>
            {isBackendEnabled ? (
              <TouchButton emphasis="primary" onClick={() => void loadAssignedWork()}>
                Aktualisieren
              </TouchButton>
            ) : null}
          </Stack>
        ) : (
          <TouchButton emphasis="primary" disabled={!recommended} onClick={() => recommended && start(recommended.caseId)}>
            {recommended ? `Empfohlenen starten · WE ${recommended.weBelegNo}` : 'Starten'}
          </TouchButton>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Delete the obsolete screens**

```bash
git rm apps/employee-pwa/src/screens/TagesstartScreen.tsx apps/employee-pwa/src/screens/PaketReihenfolgeScreen.tsx
```

- [ ] **Step 3: No commit yet** (BoxenSortieren + wiring next).

---

## Task 11: BoxenSortierenScreen + flow wiring

**Files:**
- Create: `apps/employee-pwa/src/screens/BoxenSortierenScreen.tsx`
- Modify: `apps/employee-pwa/src/workflow/useCaseFlow.ts`
- Modify: `apps/employee-pwa/src/screens/PositionScreen.tsx`

- [ ] **Step 1: Add `confirmBoxAssignment` to `useCaseFlow`**

Import `confirmBoxAssignment as confirmBoxAssignmentTx` from the model. Add to the hook body:
```ts
  const confirmBoxAssignment = useCallback(
    () =>
      commit(confirmBoxAssignmentTx, {
        eventType: 'case.started',
        entityType: 'case',
        entityId: caseId,
        payload: { step: 'box_assignment_confirmed' },
      }),
    [commit, caseId],
  );
```
Add `confirmBoxAssignment: () => Promise<void>;` to the `CaseFlow` interface and include `confirmBoxAssignment` in the returned object.

- [ ] **Step 2: Create BoxenSortierenScreen**

```tsx
/** Screen: Boxen sortieren. Engine proposes the position→box mapping; the
 *  worker confirms it (single-source fachlogik). */
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { caseStepPath } from '../routes/paths.js';

export function BoxenSortierenScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);

  if (!flow.aggregate || !flow.progress) {
    return <CaseCardSkeleton />;
  }

  const targets = flow.aggregate.boxTargets;
  const positionsById = new Map(flow.aggregate.positions.map((p) => [p.id, p]));

  const confirm = async (): Promise<void> => {
    await flow.confirmBoxAssignment();
    navigate(caseStepPath(caseId, 'boxing'));
  };

  return (
    <StepScaffold
      caseId={caseId}
      where={`Beleg WE ${flow.aggregate.case.weBelegNo}`}
      title="Boxen sortieren"
      subtitle="Welcher Artikel kommt in welche Box?"
      primary={{ label: `Sortierung übernehmen → ${targets.length} Box(en)`, onClick: confirm }}
    >
      <Stack spacing={2}>
        <Alert severity="info">Vorschlag nach Shopbereich. Beim Abschluss kannst du Abweichungen melden.</Alert>
        {targets.map((t, i) => (
          <Paper key={t.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1">Box {i + 1}</Typography>
              <Chip size="small" color="info" label={`Shopbereich ${t.shopAreaNo}`} />
            </Stack>
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              {t.positionIds.map((pid) => {
                const p = positionsById.get(pid);
                return (
                  <Typography key={pid} variant="body2">
                    {p ? `${p.supplierArticleNo} ${p.supplierColor}` : pid}
                  </Typography>
                );
              })}
              <Typography variant="body2" color="text.secondary">
                Menge: {t.plannedQuantity}
              </Typography>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </StepScaffold>
  );
}
```

- [ ] **Step 3: Route positions → sort in PositionScreen**

In `PositionScreen.tsx`, change BOTH navigations from `caseStepPath(caseId, 'boxing')` to `caseStepPath(caseId, 'sort')` (the all-confirmed early-return and the `isLast` branch in `onCorrect`).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @paket/employee-pwa typecheck`
Expected: clean except the still-untouched screens (Lagerplatz/Vorbereitung/Box/Abschluss/Problem).

- [ ] **Step 5: Commit**

```bash
git add apps/employee-pwa/src/screens/BelegListeScreen.tsx apps/employee-pwa/src/screens/BoxenSortierenScreen.tsx apps/employee-pwa/src/workflow/useCaseFlow.ts apps/employee-pwa/src/screens/PositionScreen.tsx apps/employee-pwa/src/routes/paths.ts apps/employee-pwa/src/App.tsx
git commit -m "feat(pwa): selectable beleg hub + box-sort step + route wiring"
```

---

## Task 12: Lagerplatz scan — hard block

**Files:**
- Modify: `apps/employee-pwa/src/screens/LagerplatzScanScreen.tsx`

- [ ] **Step 1: Gate the primary on a matching scan**

Import `scanMatches` from `../workflow/workflowModel.js`. Compute `const matched = scanned ? scanMatches(scanned, c.storageLocation.code) : false;`. `confirmFound` only runs when `matched`. Primary: `{ label: 'Paket gefunden – weiter', onClick: confirmFound, disabled: !matched }`. Render states: matched → success Alert (`Gescannt: {scanned}`); scanned but not matched → error Alert (`Falscher Lagerplatz – erwartet {c.storageLocation.code}, gescannt {scanned}`). Keep "Paket nicht da" → `problemPath`.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @paket/employee-pwa typecheck`
```bash
git add apps/employee-pwa/src/screens/LagerplatzScanScreen.tsx
git commit -m "feat(pwa): validate Lagerplatz scan, block on mismatch"
```

---

## Task 13: Vorbereitung — individual step ticks

**Files:**
- Modify: `apps/employee-pwa/src/screens/VorbereitungScreen.tsx`
- Modify: `apps/employee-pwa/src/workflow/useCaseFlow.ts`

- [ ] **Step 1: Add `openCarton` action to `useCaseFlow`**

Import `openCarton as openCartonTx`. Add:
```ts
  const openCarton = useCallback(
    () =>
      commit(openCartonTx, { eventType: 'case.started', entityType: 'case', entityId: caseId, payload: { step: 'carton_opened' } }),
    [commit, caseId],
  );
```
Add `openCarton: () => Promise<void>;` to the interface and include it in the return.

- [ ] **Step 2: Wire the three real steps**

Primary sequence: `!p.labelsPrinted` → "Etiketten drucken" (`flow.printLabels`); else `!p.cartonOpened` → "Karton geöffnet" (`flow.openCarton`); else "Sortierung fertig" (`flow.markPrepared` → navigate `positions`). Bind each checkbox to its own field (`labelsPrinted`, `cartonOpened`, `prepared`), disabling later ones until the prior is done. Show label count from `wi.priceLabelPrintRequired`/positions where available.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @paket/employee-pwa typecheck`
```bash
git add apps/employee-pwa/src/screens/VorbereitungScreen.tsx apps/employee-pwa/src/workflow/useCaseFlow.ts
git commit -m "feat(pwa): real Vorbereitung step confirmations (carton-open)"
```

---

## Task 14: Boxabschluss (Hängeware) + Abschluss gate + Problem

**Files:**
- Modify: `apps/employee-pwa/src/screens/BoxabschlussScreen.tsx`
- Modify: `apps/employee-pwa/src/screens/AbschlussScreen.tsx`
- Modify: `apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx`

- [ ] **Step 1: Boxabschluss — Hängeware branch**

Determine Hängeware via `flow.aggregate.boxTargets.every((t) => t.goodsType === 'haengeware')` OR `flow.aggregate.boxTargets.length === 0`. When Hängeware: render the "Hängeware abschließen" variant (steps: Etiketten angebracht → Hängeschild → auf Hängewagen) whose primary navigates straight to `caseStepPath(caseId, 'complete')`. Otherwise keep the per-box Zettel→Plombe→Band flow unchanged.

- [ ] **Step 2: Abschluss — issue-gated completion + pace + home nav**

- Keep the `openIssues` live count.
- Call `canCompleteCase(p, agg, openIssues)` (3 args).
- Replace `navigate(PAKET)` with `navigate(TAGESSTART)` (update import).
- Keep Teilabschluss with reason; add a pace line ("X Teile/Std · Ziel 75").

- [ ] **Step 3: Problem — no preselection**

Initialise `scope` and `issueType` to `''`. Render options with no default selected; disable "An Teamlead senden" until BOTH are chosen. Keep `reportIssue` and "Restware weiter bearbeiten".

- [ ] **Step 4: Typecheck + full test**

Run: `pnpm --filter @paket/employee-pwa typecheck`
Run: `pnpm --filter @paket/employee-pwa test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/employee-pwa/src/screens/BoxabschlussScreen.tsx apps/employee-pwa/src/screens/AbschlussScreen.tsx apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx
git commit -m "feat(pwa): Hängeware close path, issue-gated ZST, neutral problem form"
```

---

## Task 15: Final verification

- [ ] **Step 1: Typecheck, lint, test**

```bash
pnpm --filter @paket/employee-pwa typecheck
pnpm --filter @paket/employee-pwa lint
pnpm --filter @paket/employee-pwa test
```
Expected: all clean.

- [ ] **Step 2: Grep for dead references**

```bash
grep -rn "PickupStop\|AssignedBundle\|pickupStops\|PAKET\|getActiveBundle\|PaketReihenfolge\|TagesstartScreen" apps/employee-pwa/src || echo "clean"
```
Expected: `clean`.

- [ ] **Step 3: Manual smoke (offline demo)**

`pnpm --filter @paket/employee-pwa dev`, open the app: hub lists Belege by prio with status chips; any Beleg tappable; scan mismatch blocks; a multi-position Beleg works through sort→boxing→ZST; an open problem blocks ZST; Hängeware uses its own close path.

- [ ] **Step 4: Commit any fixups**

```bash
git add -A && git commit -m "chore(pwa): rework cleanup + verification"
```

---

## Self-Review notes (author)

- **Spec coverage:** hub/selection (T4,T10); system-only assignment + day-end refresh (T7,T10); scan hard-block (T5,T12); dynamic multi-position/SKU (T2,T7,T8); box-sort engine-proposes/worker-confirms (T5,T11); issue-gated ZST (T5,T14); Hängeware branch (T14); delete forced-order (T2,T3,T6,T9,T10,T15). All covered.
- **Type consistency:** `confirmBoxAssignment`, `scanMatches`, `openCarton`, `enterSort`, `canCompleteCase(p,agg,openIssues)`, `initialProgress(agg,now)`, `deriveBelegStatus`, `nextRecommended`, `sortBelege`, `getDay/putDay/getBelege/putBelege` used identically across tasks.
- **No placeholders:** every code step shows the code; screen-edit steps name exact fields/functions.
- **Known integration risk:** if `ReceiptPositionDto`/`CaseSummaryDto` lack `skuLines`/`goodsType`, the defensive casts keep the PWA compiling; full data requires the backend DTO + regenerated `@paket/api-client` (DB-less OpenAPI recipe), out of this plan's scope.
