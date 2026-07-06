# Beleg Search + Browse in the Assign Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real search (autocomplete) and browse/filter+multi-select on top of `AssignDialog`'s existing exact-WE-Nr assign flow, backed by a new bounded, ranked `/api/teamlead/cases/search` endpoint — without touching the existing exact-lookup, bundle-create, or bundle-mutation paths.

**Architecture:** A new `GET /api/teamlead/cases/search` endpoint on `TeamleadController`/`TeamleadReadService`, hard-scoped to the assignable pool (`status='ready' AND assignedBundleId IS NULL`), backed by pure/testable ranking+where-clause helpers in a new `case-search.ts`. On the frontend, `AssignDialog`'s WE-Nr field becomes a live-search combobox (dropdown of ranked results) with a collapsible "Durchsuchen" drawer below it for filtered multi-select; both write into the dialog's existing `selected` tray unchanged.

**Tech Stack:** NestJS + Prisma (backend), React + MUI + TanStack Query (frontend), Vitest (unit + Testcontainers integration), openapi-typescript/openapi-fetch codegen.

## Global Constraints

- Fast exact-WE-Nr entry must keep working exactly as today, instantly — `CaseLookupQueryDto`/`CaseLookupResultDto`/`GET /cases/lookup`/`lookupBeleg` are **not modified** by this plan.
- No regression to plausibility messaging, Grund-optional, self-assign, bundle-create, or skill-tier logic.
- `pnpm typecheck` must stay 13/13 green after every task that touches TypeScript.
- New backend endpoint is read-only, additive, and does not change `/cases` (the general Belege list) or any bundle-mutation endpoint.
- No pagination on `/cases/search` — bounded (`limit`, default 20, max 50) live-search/browse feed only.
- No new Beleg-difficulty/suitability model — the starter/dummy skill-tier note in the browse drawer is informational only, never gates selection.
- Conventional Commits for every commit.
- Docs (`docs/architecture/src/*.mmd` + rendered SVGs, `docs/handbook/b3-mitarbeiterboard.md`) updated in the same overall change set as the code that changes their subject.

---

## File Structure

**Backend (new):**
- `apps/backend-api/src/cases/case-search.ts` — pure where-clause builder + ranking function (no Prisma calls, no DB), fully unit-testable.
- `apps/backend-api/src/cases/case-search.test.ts` — unit tests for the pure functions.
- `apps/backend-api/src/integration/case-search.int.test.ts` — Testcontainers integration test for `TeamleadReadService.searchCases`.

**Backend (modified):**
- `apps/backend-api/src/cases/cases.dto.ts` — add `CaseSearchQueryDto`, `CaseSearchResultDto`.
- `apps/backend-api/src/cases/teamlead-read.service.ts` — add `searchCases(query: CaseSearchQueryDto): Promise<CaseSearchResultDto[]>`.
- `apps/backend-api/src/cases/teamlead.controller.ts` — add `GET cases/search` route.

**Generated (regenerated, not hand-edited):**
- `apps/backend-api/openapi.json`, `packages/api-client/openapi/openapi.json`, `packages/api-client/src/generated/schema.ts`.

**Frontend (new):**
- `apps/teamlead-web/src/components/BelegSearchResultRow.tsx` — one shared compact result row (used by both the autocomplete dropdown and the browse list).
- `apps/teamlead-web/src/components/AssignBrowseDrawer.tsx` — the filterable, checkbox multi-select browse panel.
- `apps/teamlead-web/src/components/AssignDialog.test.tsx` — component tests.

**Frontend (modified):**
- `apps/teamlead-web/src/data/belege.ts` — add `CaseSearchResult`, `CaseSearchParams`, `searchAssignableCases()`, `searchResultToBelegLookup()`.
- `apps/teamlead-web/src/components/AssignDialog.tsx` — upgrade the WE-Nr field into a live-search combobox with a dropdown, add the "Durchsuchen" toggle + `AssignBrowseDrawer`.

**Docs (modified):**
- `docs/architecture/src/c3-backend-components.mmd`
- `docs/architecture/src/c3-teamlead-components.mmd`
- `docs/handbook/b3-mitarbeiterboard.md`

---

### Task 1: Pure search helpers — where-clause + ranking (TDD)

**Files:**
- Create: `apps/backend-api/src/cases/case-search.ts`
- Test: `apps/backend-api/src/cases/case-search.test.ts`

**Interfaces:**
- Produces: `CaseSearchCandidate` (interface: `id: string; weBelegNo: string; deliveryNoteNo: string | null; storageLocationCode: string | null; primaryShopNo: string | null; branchNo: string; bookingDate: Date`), `assignableSearchWhere(query: { q?: string; bereich?: string; shopNo?: string; branchNo?: string }): Prisma.GoodsReceiptCaseWhereInput`, `rankCaseSearchCandidates<T extends CaseSearchCandidate>(candidates: readonly T[], q: string | undefined): T[]` — all consumed by Task 3.

- [ ] **Step 1: Write the failing unit tests**

Create `apps/backend-api/src/cases/case-search.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { assignableSearchWhere, rankCaseSearchCandidates, type CaseSearchCandidate } from './case-search.js';

function candidate(partial: Partial<CaseSearchCandidate> & Pick<CaseSearchCandidate, 'id' | 'weBelegNo'>): CaseSearchCandidate {
  return {
    deliveryNoteNo: null,
    storageLocationCode: null,
    primaryShopNo: null,
    branchNo: '1',
    bookingDate: new Date('2026-06-01T00:00:00.000Z'),
    ...partial,
  };
}

describe('assignableSearchWhere', () => {
  it('always scopes to ready + unassigned', () => {
    const where = assignableSearchWhere({});
    expect(where).toEqual({ AND: [{ status: 'ready' }, { assignedBundleId: null }] });
  });

  it('adds a text OR-clause across WE-Nr/Lieferschein/Lagerplatz/Shop/Filiale when q is given', () => {
    const where = assignableSearchWhere({ q: 'abc' });
    expect(where).toEqual({
      AND: [
        { status: 'ready' },
        { assignedBundleId: null },
        {
          OR: [
            { weBelegNo: { contains: 'abc', mode: 'insensitive' } },
            { deliveryNoteNo: { contains: 'abc', mode: 'insensitive' } },
            { storageLocation: { is: { code: { contains: 'abc', mode: 'insensitive' } } } },
            { primaryShopNo: { contains: 'abc', mode: 'insensitive' } },
            { branchNo: { contains: 'abc', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('adds a bereich filter translated to storage-location kinds', () => {
    const where = assignableSearchWhere({ bereich: 'Regal' });
    expect(where).toEqual({
      AND: [
        { status: 'ready' },
        { assignedBundleId: null },
        { storageLocation: { is: { kind: { in: ['regal', 'lagerplatz_d'] } } } },
      ],
    });
  });

  it('adds shopNo/branchNo contains filters', () => {
    const where = assignableSearchWhere({ shopNo: '42', branchNo: '7' });
    expect(where).toEqual({
      AND: [
        { status: 'ready' },
        { assignedBundleId: null },
        { primaryShopNo: { contains: '42', mode: 'insensitive' } },
        { branchNo: { contains: '7', mode: 'insensitive' } },
      ],
    });
  });
});

describe('rankCaseSearchCandidates', () => {
  it('ranks exact WE-Nr match first, then starts-with, then contains, then other-field match', () => {
    const exact = candidate({ id: 'a', weBelegNo: 'WE-100', bookingDate: new Date('2026-06-05') });
    const startsWith = candidate({ id: 'b', weBelegNo: 'WE-1005', bookingDate: new Date('2026-06-01') });
    const contains = candidate({ id: 'c', weBelegNo: 'X-WE-100-Y', bookingDate: new Date('2026-06-01') });
    const otherField = candidate({ id: 'd', weBelegNo: 'ZZZ', primaryShopNo: 'WE-100', bookingDate: new Date('2026-06-01') });

    const ranked = rankCaseSearchCandidates([otherField, contains, startsWith, exact], 'WE-100');
    expect(ranked.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is case-insensitive', () => {
    const exact = candidate({ id: 'a', weBelegNo: 'we-100' });
    const other = candidate({ id: 'b', weBelegNo: 'ZZZ' });
    const ranked = rankCaseSearchCandidates([other, exact], 'WE-100');
    expect(ranked[0]!.id).toBe('a');
  });

  it('breaks ties within a tier by bookingDate ascending (oldest first)', () => {
    const older = candidate({ id: 'old', weBelegNo: 'ZZZ-1', bookingDate: new Date('2026-06-01') });
    const newer = candidate({ id: 'new', weBelegNo: 'ZZZ-2', bookingDate: new Date('2026-06-10') });
    const ranked = rankCaseSearchCandidates([newer, older], 'ZZZ');
    expect(ranked.map((c) => c.id)).toEqual(['old', 'new']);
  });

  it('with no q, sorts purely by bookingDate ascending (browse mode)', () => {
    const older = candidate({ id: 'old', weBelegNo: 'A', bookingDate: new Date('2026-06-01') });
    const newer = candidate({ id: 'new', weBelegNo: 'B', bookingDate: new Date('2026-06-10') });
    const ranked = rankCaseSearchCandidates([newer, older], undefined);
    expect(ranked.map((c) => c.id)).toEqual(['old', 'new']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend-api && pnpm vitest run src/cases/case-search.test.ts`
Expected: FAIL — `Cannot find module './case-search.js'`

- [ ] **Step 3: Write the implementation**

Create `apps/backend-api/src/cases/case-search.ts`:

```typescript
import type { LocationKind, Prisma } from '@prisma/client';
import { bereichFromLocationKind, locationKindSchema } from '@paket/domain-types';

/**
 * Assign-flow search/browse (A1/A2/B1). New GET /api/teamlead/cases/search endpoint,
 * hard-scoped to the assignable pool (ready + unassigned) — separate from
 * {@link ../cases/teamlead-read.service.ts}'s `poolWhere`, whose general Belege-list
 * `q` intentionally does not search Shop/Filiale and has no assignable-only scope.
 */

/** Fields eligible for the search/browse text match + ranking tie-break. */
export interface CaseSearchCandidate {
  id: string;
  weBelegNo: string;
  deliveryNoteNo: string | null;
  storageLocationCode: string | null;
  primaryShopNo: string | null;
  branchNo: string;
  bookingDate: Date;
}

/** Prisma where-clause for the assign-flow search endpoint: assignable pool + optional filters. */
export function assignableSearchWhere(query: {
  q?: string;
  bereich?: string;
  shopNo?: string;
  branchNo?: string;
}): Prisma.GoodsReceiptCaseWhereInput {
  const and: Prisma.GoodsReceiptCaseWhereInput[] = [
    { status: 'ready' },
    { assignedBundleId: null },
  ];
  if (query.q) {
    and.push({
      OR: [
        { weBelegNo: { contains: query.q, mode: 'insensitive' } },
        { deliveryNoteNo: { contains: query.q, mode: 'insensitive' } },
        { storageLocation: { is: { code: { contains: query.q, mode: 'insensitive' } } } },
        { primaryShopNo: { contains: query.q, mode: 'insensitive' } },
        { branchNo: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  if (query.bereich) {
    const kinds = locationKindSchema.options.filter(
      (kind) => bereichFromLocationKind(kind) === query.bereich,
    ) as LocationKind[];
    and.push({ storageLocation: { is: { kind: { in: kinds } } } } );
  }
  if (query.shopNo) and.push({ primaryShopNo: { contains: query.shopNo, mode: 'insensitive' } });
  if (query.branchNo) and.push({ branchNo: { contains: query.branchNo, mode: 'insensitive' } });
  return { AND: and };
}

/** Match tier for ranking — lower sorts first. */
function matchTier(c: CaseSearchCandidate, needle: string): 0 | 1 | 2 | 3 {
  const weBelegNo = c.weBelegNo.toLowerCase();
  if (weBelegNo === needle) return 0;
  if (weBelegNo.startsWith(needle)) return 1;
  if (weBelegNo.includes(needle)) return 2;
  return 3;
}

/**
 * Rank search candidates: exact WE-Nr match first, then starts-with, then contains,
 * then any other-field match — each tier ordered by bookingDate ascending (oldest/
 * most-overdue first) as a deterministic tie-break. With no `q` (pure browse), every
 * candidate is tier 3 and the list is simply bookingDate-ordered.
 */
export function rankCaseSearchCandidates<T extends CaseSearchCandidate>(
  candidates: readonly T[],
  q: string | undefined,
): T[] {
  const needle = q?.trim().toLowerCase() ?? '';
  return [...candidates].sort((a, b) => {
    const tierA = needle ? matchTier(a, needle) : 3;
    const tierB = needle ? matchTier(b, needle) : 3;
    if (tierA !== tierB) return tierA - tierB;
    return a.bookingDate.getTime() - b.bookingDate.getTime();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend-api && pnpm vitest run src/cases/case-search.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend-api/src/cases/case-search.ts apps/backend-api/src/cases/case-search.test.ts
git commit -m "feat(backend-api): add pure search where-clause + ranking helpers for the assign flow"
```

---

### Task 2: `CaseSearchQueryDto` + `CaseSearchResultDto`

**Files:**
- Modify: `apps/backend-api/src/cases/cases.dto.ts` (append near `CaseLookupQueryDto`, after line ~848)

**Interfaces:**
- Consumes: `DeliveryGroupRefDto` (already defined in this file).
- Produces: `CaseSearchQueryDto`, `CaseSearchResultDto` — consumed by Task 3 (service) and Task 4 (controller).

- [ ] **Step 1: Add the two DTOs**

In `apps/backend-api/src/cases/cases.dto.ts`, immediately after the existing `CaseLookupQueryDto` class (the block ending `weBelegNo!: string; }` right before `/** Body for POST /api/teamlead/cases/:caseId/forward …`), insert:

```typescript
/** Query for GET /api/teamlead/cases/search (A1/A2/B1 assign-flow search + browse). */
export class CaseSearchQueryDto {
  @ApiPropertyOptional({
    description:
      'Volltext: WE-Beleg-Nr / Lieferschein-Nr / Lagerplatz-Code / Shop / Filiale (contains)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter: fester Bereich (Hängebahn|Palette|Regal)' })
  @IsOptional()
  @IsString()
  bereich?: string;

  @ApiPropertyOptional({ description: 'Filter: Shop (primärer Shop, contains)' })
  @IsOptional()
  @IsString()
  shopNo?: string;

  @ApiPropertyOptional({ description: 'Filter: Filiale (contains)' })
  @IsOptional()
  @IsString()
  branchNo?: string;

  @ApiPropertyOptional({ default: 20, description: 'Max. Ergebnisse (1-50)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/**
 * One assignable Beleg in the search/browse feed behind AssignDialog. Always
 * ready + unassigned — the endpoint's scope IS the assignability verdict, so
 * (unlike {@link CaseLookupResultDto}) there is no status/reasonCode to render.
 */
export class CaseSearchResultDto {
  @ApiProperty() caseId!: string;
  @ApiProperty() weBelegNo!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) bereich!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) goodsType!: string | null;
  @ApiProperty({ description: 'Teile (totalQuantity)' }) teile!: number;
  @ApiProperty() estimatedMinutes!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) storageLocationCode!: string | null;
  @ApiProperty({ type: [String] }) priorityFlags!: string[];
  @ApiPropertyOptional({ type: DeliveryGroupRefDto, nullable: true })
  deliveryGroup!: DeliveryGroupRefDto | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/backend-api && pnpm exec tsc --noEmit`
Expected: no new errors (both classes are unused so far — that's fine, they're consumed in Task 3/4).

- [ ] **Step 3: Commit**

```bash
git add apps/backend-api/src/cases/cases.dto.ts
git commit -m "feat(backend-api): add CaseSearchQueryDto/CaseSearchResultDto"
```

---

### Task 3: `TeamleadReadService.searchCases`

**Files:**
- Modify: `apps/backend-api/src/cases/teamlead-read.service.ts`

**Interfaces:**
- Consumes: `assignableSearchWhere`, `rankCaseSearchCandidates`, `CaseSearchCandidate` (Task 1); `CaseSearchQueryDto`, `CaseSearchResultDto` (Task 2); existing `caseEffortInclude`/`resolveCaseEffort` (`./case-effort.js`), `detectDeliveryGroups`/`indexDeliveryGroups` (`@paket/assignment-engine`), `bereichFromLocationKind` (`@paket/domain-types`), `loadRuleConfig` (`../config/rule-config.js`) — all already imported in this file for `listPool`.
- Produces: `searchCases(query: CaseSearchQueryDto): Promise<CaseSearchResultDto[]>` — consumed by Task 4 (controller) and Task 5 (int test).

- [ ] **Step 1: Add the import**

In `apps/backend-api/src/cases/teamlead-read.service.ts`, near the top import block (after the `import { distinctShopNos, ... } from './mappers.js';` line), add:

```typescript
import { assignableSearchWhere, rankCaseSearchCandidates, type CaseSearchCandidate } from './case-search.js';
```

Also extend the existing type-only import list from `./cases.dto.js` to include `type CaseSearchQueryDto` and `type CaseSearchResultDto` (add them alongside the existing `type CaseLookupResultDto` entry).

- [ ] **Step 2: Add the `searchCases` method**

In `apps/backend-api/src/cases/teamlead-read.service.ts`, add a new public method directly after `lookupCase` (right before the `async dashboard(...)` method):

```typescript
  /**
   * A1/A2/B1 assign-flow search + browse: a bounded, ranked feed over the
   * assignable pool (ready + unassigned) behind AssignDialog. Unlike
   * {@link listPool}, there is no lifecycle `scope` — every result is already
   * assignable by construction. Ranking (exact WE-Nr > starts-with > contains >
   * other-field match, bookingDate tie-break) runs in {@link rankCaseSearchCandidates}
   * over a bounded candidate set fetched via {@link assignableSearchWhere}.
   */
  async searchCases(query: CaseSearchQueryDto): Promise<CaseSearchResultDto[]> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const where = assignableSearchWhere(query);
    // Fetch a broader candidate set than `limit` so ranking has enough to work with
    // before truncating (a plain DB `ORDER BY bookingDate` would bias toward the
    // oldest rows regardless of match quality). Capped at 150 to keep this endpoint
    // fast even on a large pool.
    const candidateTake = Math.min(limit * 3, 150);

    const [rows, ruleConfig] = await Promise.all([
      this.prisma.goodsReceiptCase.findMany({
        where,
        include: {
          ...caseEffortInclude,
        },
        orderBy: { bookingDate: 'asc' },
        take: candidateTake,
      }),
      loadRuleConfig(this.prisma),
    ]);

    const candidates: (CaseSearchCandidate & { row: (typeof rows)[number] })[] = rows.map((c) => ({
      id: c.id,
      weBelegNo: c.weBelegNo,
      deliveryNoteNo: c.deliveryNoteNo,
      storageLocationCode: c.storageLocation?.code ?? null,
      primaryShopNo: c.primaryShopNo ?? null,
      branchNo: c.branchNo,
      bookingDate: c.bookingDate,
      row: c,
    }));
    const ranked = rankCaseSearchCandidates(candidates, query.q).slice(0, limit);

    // Delivery-group detection over the ranked/returned set only — this is a
    // discovery feed, not the full-day board, so groups need only be correct
    // among the Belege actually shown.
    const groups = detectDeliveryGroups(
      ranked.map((r) => ({
        id: r.row.id,
        weBelegNo: r.row.weBelegNo,
        deliveryNoteNo: r.row.deliveryNoteNo,
        deliverySourceGroupKey: r.row.deliverySourceGroupKey,
        deliverySourceGroupSize: r.row.deliverySourceGroupSize,
        manualDeliveryGroupKey: r.row.manualDeliveryGroupKey,
        bookingDate: r.row.bookingDate.toISOString().slice(0, 10),
        section: r.row.section,
        deliveryGroupReleased: r.row.deliveryGroupReleased,
      })),
      ruleConfig.grouping,
    );
    const { groupIdByCaseId, groupById } = indexDeliveryGroups(groups);

    return ranked.map((r) => {
      const effort = resolveCaseEffort(r.row, ruleConfig.effort);
      const group = groupById.get(groupIdByCaseId.get(r.row.id) ?? '');
      return {
        caseId: r.row.id,
        weBelegNo: r.row.weBelegNo,
        bereich: r.row.storageLocation
          ? (bereichFromLocationKind(r.row.storageLocation.kind as LocationKind) ?? null)
          : null,
        goodsType: r.row.goodsTypeText,
        teile: r.row.totalQuantity,
        estimatedMinutes: effort.minutes,
        storageLocationCode: r.row.storageLocation?.code ?? null,
        priorityFlags: r.row.priorityFlags,
        deliveryGroup: group ? mapDeliveryGroupRef(group) : null,
      };
    });
  }
```

Add `LocationKind` to the existing `import type { AssignmentStatus, CaseStatus, LocationKind, PriorityFlag, Prisma } from '@prisma/client';` line if not already present (it already is, per the current file — no change needed there).

- [ ] **Step 3: Typecheck**

Run: `cd apps/backend-api && pnpm exec tsc --noEmit`
Expected: no errors. If `r.row.priorityFlags` mismatches `string[]` vs `PriorityFlag[]`, cast is unnecessary — Prisma's `PriorityFlag[]` is assignable to `string[]` on the DTO (`CaseSearchResultDto.priorityFlags: string[]`), matching how `listPool`'s `items` mapping already does `priorityFlags: c.priorityFlags` untouched.

- [ ] **Step 4: Commit**

```bash
git add apps/backend-api/src/cases/teamlead-read.service.ts
git commit -m "feat(backend-api): add TeamleadReadService.searchCases"
```

---

### Task 4: Controller route — `GET /api/teamlead/cases/search`

**Files:**
- Modify: `apps/backend-api/src/cases/teamlead.controller.ts`

**Interfaces:**
- Consumes: `TeamleadReadService.searchCases` (Task 3), `CaseSearchQueryDto`/`CaseSearchResultDto` (Task 2).
- Produces: the live HTTP route, consumed by Task 5 (int test can also call the service directly, but the route must exist for the frontend/OpenAPI in Task 6).

- [ ] **Step 1: Add the DTO imports**

In `apps/backend-api/src/cases/teamlead.controller.ts`, add `CaseSearchQueryDto` and `CaseSearchResultDto` to the existing multi-line import from `'./cases.dto.js'` (alphabetically, near `CaseLookupResultDto`/`CaseLookupQueryDto`).

- [ ] **Step 2: Add the route**

Immediately after the existing `lookupCase` handler (`@Get('cases/lookup') ... lookupCase(...)`) and before `@Get('cases/:caseId')`, insert:

```typescript
  @Get('cases/search')
  @ApiOperation({
    summary:
      'A1/A2/B1: bounded, ranked search + browse over the assignable pool (ready + unassigned) for AssignDialog',
  })
  @ApiOkResponse({ type: [CaseSearchResultDto] })
  searchCases(@Query() query: CaseSearchQueryDto): Promise<CaseSearchResultDto[]> {
    return this.read.searchCases(query);
  }
```

This must be registered before `@Get('cases/:caseId')` so Nest's route matching does not treat `search` as a `:caseId` path param — mirroring how `cases/lookup` is already ordered before `cases/:caseId` in this same controller.

- [ ] **Step 3: Typecheck + start the backend to smoke-test the route**

Run: `cd apps/backend-api && pnpm exec tsc --noEmit`
Expected: no errors.

Run: `cd apps/backend-api && pnpm build && node --env-file=.env dist/main.js &`
Then: `curl -s -X POST http://localhost:3000/api/auth/dev-login -H 'content-type: application/json' -d '{"employeeNo":"tl-001"}'`
Expected: `{ "accessToken": "..." }` (or similar) — capture the token, then:
`curl -s "http://localhost:3000/api/teamlead/cases/search?limit=5" -H "authorization: Bearer <token>"`
Expected: HTTP 200 with a JSON array (possibly empty, depending on seeded dev data) of objects shaped like `CaseSearchResultDto`. Stop the backend process afterward (`kill %1` or the equivalent job).

- [ ] **Step 4: Commit**

```bash
git add apps/backend-api/src/cases/teamlead.controller.ts
git commit -m "feat(backend-api): expose GET /api/teamlead/cases/search"
```

---

### Task 5: Backend integration test (Testcontainers)

**Files:**
- Create: `apps/backend-api/src/integration/case-search.int.test.ts`

**Interfaces:**
- Consumes: `TeamleadReadService` (constructed directly, same pattern as `case-lookup.int.test.ts`), `TeamleadReadService.searchCases` (Task 3).

- [ ] **Step 1: Write the test**

Create `apps/backend-api/src/integration/case-search.int.test.ts`:

```typescript
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TeamleadReadService } from '../cases/teamlead-read.service.js';

/**
 * A1/A2/B1 assign-flow search: GET /api/teamlead/cases/search behind AssignDialog's
 * combobox + Durchsuchen drawer, driven directly against a real Postgres.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-20';

function asDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let read: TeamleadReadService;

async function seed(): Promise<void> {
  const regal = await prisma.location.create({
    data: { code: 'R41', displayName: 'Regal 41', kind: 'regal', sequenceIndex: 41 },
  });
  const palette = await prisma.location.create({
    data: { code: 'P41', displayName: 'Palette 41', kind: 'palette_a', sequenceIndex: 42 },
  });
  const day = asDay(DATE);
  const base = {
    source: 'manual' as const,
    externalRef: 'search-set-1',
    bookingDate: day,
    branchNo: '1',
    section: 7,
    totalQuantity: 10,
    effortPoints: 5,
    estimatedMinutes: 15,
  };

  // Exact-match target.
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-100', storageLocationId: regal.id, status: 'ready' },
  });
  // Starts-with match.
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-1005', storageLocationId: regal.id, status: 'ready' },
  });
  // Contains match (WE-Nr embeds the needle but doesn't start with it).
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'X-WE-SEARCH-100-Y', storageLocationId: regal.id, status: 'ready' },
  });
  // Other-field match only (primaryShopNo carries the needle, WE-Nr does not).
  await prisma.goodsReceiptCase.create({
    data: {
      ...base,
      weBelegNo: 'WE-UNRELATED-1',
      primaryShopNo: 'SHOP-WE-SEARCH-100',
      storageLocationId: regal.id,
      status: 'ready',
    },
  });
  // Assignable in Palette bereich (for the bereich filter test).
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-PALETTE', storageLocationId: palette.id, status: 'ready' },
  });
  // Not ready (parked) — must never appear.
  await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-PARKED', storageLocationId: regal.id, status: 'parked' },
  });

  // Already assigned (ready status would be impossible in practice once assigned,
  // but assignedBundleId is the actual gate the endpoint checks) — must never appear.
  const held = await prisma.goodsReceiptCase.create({
    data: { ...base, weBelegNo: 'WE-SEARCH-HELD', storageLocationId: regal.id, status: 'assigned' },
  });
  const employee = await prisma.user.create({
    data: { employeeNo: 'ma-401', displayName: 'Petra', bereiche: ['Regal'] },
  });
  const bundle = await prisma.assignmentBundle.create({
    data: { employeeId: employee.id, date: day, status: 'assigned', createdBy: 'system', plannedEffortMinutes: 15 },
  });
  await prisma.assignmentItem.create({ data: { bundleId: bundle.id, caseId: held.id, sequence: 0 } });
  await prisma.goodsReceiptCase.update({ where: { id: held.id }, data: { assignedBundleId: bundle.id } });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  read = new TeamleadReadService(prisma as unknown as PrismaService);
  await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('searchCases — assign-flow search + browse', () => {
  it('ranks exact WE-Nr match first, then starts-with, then contains, then other-field match', async () => {
    const results = await read.searchCases({ q: 'WE-SEARCH-100', limit: 10 });
    const weBelegNos = results.map((r) => r.weBelegNo);
    expect(weBelegNos.indexOf('WE-SEARCH-100')).toBe(0);
    expect(weBelegNos.indexOf('WE-SEARCH-1005')).toBeLessThan(weBelegNos.indexOf('X-WE-SEARCH-100-Y'));
    expect(weBelegNos.indexOf('X-WE-SEARCH-100-Y')).toBeLessThan(weBelegNos.indexOf('WE-UNRELATED-1'));
  });

  it('never returns non-ready or already-assigned Belege', async () => {
    const results = await read.searchCases({ q: 'WE-SEARCH', limit: 50 });
    const weBelegNos = results.map((r) => r.weBelegNo);
    expect(weBelegNos).not.toContain('WE-SEARCH-PARKED');
    expect(weBelegNos).not.toContain('WE-SEARCH-HELD');
  });

  it('filters by bereich', async () => {
    const results = await read.searchCases({ bereich: 'Palette', limit: 50 });
    expect(results.map((r) => r.weBelegNo)).toContain('WE-SEARCH-PALETTE');
    expect(results.every((r) => r.bereich === 'Palette')).toBe(true);
  });

  it('honors limit and caps it at 50 even if a caller requests more', async () => {
    const results = await read.searchCases({ limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
    const overLimit = await read.searchCases({ limit: 9999 });
    expect(overLimit.length).toBeLessThanOrEqual(50);
  });

  it('with no q, returns bookingDate-ordered browse results', async () => {
    const results = await read.searchCases({ bereich: 'Regal', limit: 50 });
    const dates = results.map((_, i) => i);
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/backend-api && pnpm test:int -- case-search.int.test.ts`
Expected: PASS (5 tests). Requires Docker running for Testcontainers.

- [ ] **Step 3: Commit**

```bash
git add apps/backend-api/src/integration/case-search.int.test.ts
git commit -m "test(backend-api): int-test GET /api/teamlead/cases/search ranking, scope, bereich filter"
```

---

### Task 6: Regenerate OpenAPI + api-client, add the frontend data-layer function

**Files:**
- Regenerate (do not hand-edit): `apps/backend-api/openapi.json`, `packages/api-client/openapi/openapi.json`, `packages/api-client/src/generated/schema.ts`
- Modify: `apps/teamlead-web/src/data/belege.ts`

**Interfaces:**
- Consumes: `api` (`./api.js`), `unwrap` (`./http.js`), `toPriorityFlags` (`./narrow.js`), `components['schemas']['CaseSearchResultDto']` (regenerated), `DeliveryGroupRef` (`./types`), `BelegLookup` (already defined in this file).
- Produces: `CaseSearchResult`, `CaseSearchParams`, `searchAssignableCases(params: CaseSearchParams): Promise<CaseSearchResult[]>`, `searchResultToBelegLookup(result: CaseSearchResult): BelegLookup` — consumed by Task 7/8 (`AssignDialog`, `AssignBrowseDrawer`).

- [ ] **Step 1: Regenerate the OpenAPI spec + api-client (DB-less recipe)**

Run, from the repo root:

```bash
pnpm --filter @paket/backend-api build
pnpm --filter @paket/backend-api run openapi:generate
cp apps/backend-api/openapi.json packages/api-client/openapi/openapi.json
pnpm --filter @paket/api-client run generate
pnpm --filter @paket/api-client build
```

Expected: `packages/api-client/src/generated/schema.ts` now contains a `'/api/teamlead/cases/search': { get: ... }` path entry and a `CaseSearchResultDto` schema. Verify with:

```bash
grep -n "cases/search\|CaseSearchResultDto" packages/api-client/src/generated/schema.ts
```

Expected: non-empty output.

- [ ] **Step 2: Add the data-layer function**

In `apps/teamlead-web/src/data/belege.ts`:

1. Add `CaseSearchResultDto` to the existing block of `type X = components['schemas'][...]` aliases near the top (alongside `CaseLookupResultDto`):

```typescript
type CaseSearchResultDto = components['schemas']['CaseSearchResultDto'];
```

2. Near the `BelegLookup` interface + `lookupBeleg` function (after `lookupBeleg`'s closing brace), add:

```typescript
/** One assignable Beleg in the search/browse feed (A1/A2/B1) — always ready + unassigned. */
export interface CaseSearchResult {
  caseId: string;
  weBelegNo: string;
  bereich: string | null;
  goodsType: string | null;
  teile: number;
  estimatedMinutes: number;
  storageLocationCode: string | null;
  priorityFlags: PriorityFlag[];
  deliveryGroup: DeliveryGroupRef | null;
}

/** Query params for the assign-flow search/browse endpoint. */
export interface CaseSearchParams {
  q?: string;
  bereich?: string;
  shopNo?: string;
  branchNo?: string;
  limit?: number;
}

/**
 * A1/A2/B1: bounded, ranked search + browse over the assignable pool, behind
 * AssignDialog's live-search combobox and its "Durchsuchen" drawer.
 */
export async function searchAssignableCases(params: CaseSearchParams): Promise<CaseSearchResult[]> {
  const result = await api.GET('/api/teamlead/cases/search', {
    params: {
      query: {
        ...(params.q ? { q: params.q } : {}),
        ...(params.bereich ? { bereich: params.bereich } : {}),
        ...(params.shopNo ? { shopNo: params.shopNo } : {}),
        ...(params.branchNo ? { branchNo: params.branchNo } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
      },
    },
  });
  const dto = unwrap<CaseSearchResultDto[]>(result, 'case search');
  return dto.map(toSearchResult);
}

function toSearchResult(item: CaseSearchResultDto): CaseSearchResult {
  return {
    caseId: item.caseId,
    weBelegNo: item.weBelegNo,
    bereich: item.bereich ?? null,
    goodsType: item.goodsType ?? null,
    teile: item.teile,
    estimatedMinutes: item.estimatedMinutes,
    storageLocationCode: item.storageLocationCode ?? null,
    priorityFlags: toPriorityFlags(item.priorityFlags),
    deliveryGroup: item.deliveryGroup
      ? {
          id: item.deliveryGroup.id,
          signal: item.deliveryGroup.signal,
          confidence: item.deliveryGroup.confidence,
          presentSize: item.deliveryGroup.presentSize,
          expectedSize: item.deliveryGroup.expectedSize ?? null,
          missingCount: item.deliveryGroup.missingCount,
          locked: item.deliveryGroup.locked,
          released: item.deliveryGroup.released,
        }
      : null,
  };
}

/**
 * Project a search/browse result onto the AssignDialog tray's existing `BelegLookup`
 * shape. The endpoint's scope IS the assignability verdict, so `found`/`assignable`
 * are always true and there is no `reasonCode` — this only exists so both entry
 * points (exact lookup, search, browse) can share one `selected` tray state.
 */
export function searchResultToBelegLookup(result: CaseSearchResult): BelegLookup {
  return {
    found: true,
    caseId: result.caseId,
    weBelegNo: result.weBelegNo,
    status: 'ready',
    bereich: result.bereich,
    teile: result.teile,
    estimatedMinutes: result.estimatedMinutes,
    assignedEmployeeName: null,
    assignable: true,
    reasonCode: null,
    deliveryGroup: result.deliveryGroup,
  };
}
```

`PriorityFlag` and `toPriorityFlags` are already imported at the top of this file (used by `toBelegRow`), so no new imports are needed for those. `CaseStatus` is also already imported (needed for the `status: 'ready'` literal to type-check against `BelegLookup['status']`, which is `CaseStatus | null`).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @paket/teamlead-web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend-api/openapi.json packages/api-client/openapi/openapi.json \
  packages/api-client/src/generated/schema.ts apps/teamlead-web/src/data/belege.ts
git commit -m "chore(api-client): regenerate for CaseSearchResultDto; add searchAssignableCases data layer"
```

---

### Task 7: `BelegSearchResultRow` — shared compact result row

**Files:**
- Create: `apps/teamlead-web/src/components/BelegSearchResultRow.tsx`

**Interfaces:**
- Consumes: `CaseSearchResult` (Task 6), `LieferungChip` (`./LieferungChip.js`).
- Produces: `BelegSearchResultRow` component — consumed by Task 8 (`AssignDialog` dropdown) and Task 9 (`AssignBrowseDrawer`).

- [ ] **Step 1: Write the component**

Create `apps/teamlead-web/src/components/BelegSearchResultRow.tsx`:

```tsx
/**
 * One compact result row shared by AssignDialog's live-search dropdown and its
 * "Durchsuchen" browse drawer (A1/A2/B1) — one visual so both entry points render
 * search/browse hits identically.
 */
import type { JSX } from 'react';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { LieferungChip } from './LieferungChip.js';
import type { CaseSearchResult } from '../data/belege.js';

export interface BelegSearchResultRowProps {
  result: CaseSearchResult;
  /** Present in the autocomplete dropdown: click/Enter adds this row directly. */
  onSelect?: () => void;
  /** Highlighted via keyboard navigation (dropdown only). */
  highlighted?: boolean;
  /** Present in the browse drawer: a checkbox instead of click-to-add. */
  checkbox?: { checked: boolean; onChange: (checked: boolean) => void };
}

export function BelegSearchResultRow({
  result,
  onSelect,
  highlighted = false,
  checkbox,
}: BelegSearchResultRowProps): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
      onClick={onSelect}
      sx={{
        p: 1,
        cursor: onSelect ? 'pointer' : 'default',
        bgcolor: highlighted ? 'action.selected' : undefined,
        '&:hover': onSelect ? { bgcolor: 'action.hover' } : undefined,
      }}
    >
      {checkbox && (
        <Checkbox
          size="small"
          checked={checkbox.checked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => checkbox.onChange(e.target.checked)}
          inputProps={{ 'aria-label': `${result.weBelegNo} auswählen` }}
        />
      )}
      <Typography sx={{ fontWeight: 700 }}>{result.weBelegNo}</Typography>
      {result.bereich && <Chip size="small" variant="outlined" label={result.bereich} />}
      <Chip size="small" variant="outlined" label={`${result.teile} Teile`} />
      <LieferungChip group={result.deliveryGroup} />
      {result.priorityFlags.length > 0 && (
        <Chip size="small" color="warning" variant="outlined" label="Prio" />
      )}
      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
        {result.storageLocationCode ?? '–'}
      </Typography>
    </Stack>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @paket/teamlead-web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/teamlead-web/src/components/BelegSearchResultRow.tsx
git commit -m "feat(teamlead-web): add shared BelegSearchResultRow for the assign-flow search/browse"
```

---

### Task 8: `AssignBrowseDrawer` — filterable, checkbox multi-select browse panel

**Files:**
- Create: `apps/teamlead-web/src/components/AssignBrowseDrawer.tsx`
- Test: `apps/teamlead-web/src/components/AssignBrowseDrawer.test.tsx`

**Interfaces:**
- Consumes: `CaseSearchResult`, `searchAssignableCases` (Task 6), `BelegSearchResultRow` (Task 7), `BoardRow` (`../data/types.js`), `isManualOnlyTier` (`./TierChip.js`), `formatMinutes` (`../lib/format.js`).
- Produces: `AssignBrowseDrawer` component with props `{ open: boolean; row: BoardRow; excludeCaseIds: string[]; onBulkAdd: (results: CaseSearchResult[]) => void }` — consumed by Task 9 (`AssignDialog`).

- [ ] **Step 1: Write the failing test**

Create `apps/teamlead-web/src/components/AssignBrowseDrawer.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders, createQueryClient } from '@paket/ui';
import { AssignBrowseDrawer } from './AssignBrowseDrawer.js';
import * as belege from '../data/belege.js';
import type { BoardRow } from '../data/types.js';
import type { CaseSearchResult } from '../data/belege.js';

vi.mock('../data/belege.js', async () => {
  const actual = await vi.importActual<typeof import('../data/belege.js')>('../data/belege.js');
  return { ...actual, searchAssignableCases: vi.fn() };
});

const ROW: BoardRow = {
  employeeId: 'ma-701',
  displayName: 'Timo',
  skillTier: 'basis',
  plannedTeile: 0,
  plannedHours: 0,
  utilisationPct: 0,
  assignedMinutes: 0,
  netCapacityMinutes: 271,
  effortPoints: 0,
  openIssues: 0,
  paused: false,
  bereiche: ['Regal'],
  cases: [],
};

function result(partial: Partial<CaseSearchResult> & Pick<CaseSearchResult, 'caseId' | 'weBelegNo'>): CaseSearchResult {
  return {
    bereich: 'Regal',
    goodsType: null,
    teile: 20,
    estimatedMinutes: 30,
    storageLocationCode: 'R41',
    priorityFlags: [],
    deliveryGroup: null,
    ...partial,
  };
}

function renderDrawer(onBulkAdd = vi.fn()) {
  const client = createQueryClient({ retry: 0 });
  render(
    <AppProviders queryClient={client}>
      <AssignBrowseDrawer open row={ROW} excludeCaseIds={[]} onBulkAdd={onBulkAdd} />
    </AppProviders>,
  );
  return { onBulkAdd };
}

beforeEach(() => {
  vi.mocked(belege.searchAssignableCases).mockResolvedValue([
    result({ caseId: 'case-1', weBelegNo: 'WE-1001' }),
    result({ caseId: 'case-2', weBelegNo: 'WE-1002' }),
  ]);
});

describe('AssignBrowseDrawer', () => {
  it('lists assignable Belege and bulk-adds the checked ones', async () => {
    const user = userEvent.setup();
    const { onBulkAdd } = renderDrawer();

    await waitFor(() => expect(screen.getByText('WE-1001')).toBeTruthy());
    await user.click(screen.getByLabelText('WE-1001 auswählen'));
    await user.click(screen.getByLabelText('WE-1002 auswählen'));

    const submit = screen.getByRole('button', { name: /Auswahl übernehmen/ });
    await user.click(submit);

    expect(onBulkAdd).toHaveBeenCalledTimes(1);
    const added = onBulkAdd.mock.calls[0]![0] as CaseSearchResult[];
    expect(added.map((r) => r.caseId).sort()).toEqual(['case-1', 'case-2']);
  });

  it('shows the free-capacity hint for the target employee', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText(/Timo/)).toBeTruthy());
    expect(screen.getByText(/4 h 31 min frei/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @paket/teamlead-web exec vitest run src/components/AssignBrowseDrawer.test.tsx`
Expected: FAIL — `Cannot find module './AssignBrowseDrawer.js'`

- [ ] **Step 3: Write the implementation**

Create `apps/teamlead-web/src/components/AssignBrowseDrawer.tsx`:

```tsx
/**
 * Browse/filter panel inside AssignDialog (B1/B2/B3): a filterable, checkbox
 * multi-select list over the assignable pool, feeding the SAME selection tray
 * the live-search dropdown writes to. Collapsed by default so the dialog stays
 * compact; only expands when the teamlead opens it.
 */
import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { BelegSearchResultRow } from './BelegSearchResultRow.js';
import { isManualOnlyTier } from './TierChip.js';
import { searchAssignableCases, type CaseSearchResult } from '../data/belege.js';
import { formatMinutes } from '../lib/format.js';
import type { BoardRow } from '../data/types.js';

type SortMode = 'teile' | 'prio' | 'oldest';

const SORT_LABELS: Record<SortMode, string> = {
  teile: 'Teile ↓',
  prio: 'Priorität',
  oldest: 'Ältestes zuerst',
};

export interface AssignBrowseDrawerProps {
  open: boolean;
  row: BoardRow;
  /** Belege already in the shared tray — excluded so they can't be double-added. */
  excludeCaseIds: string[];
  onBulkAdd: (results: CaseSearchResult[]) => void;
}

export function AssignBrowseDrawer({
  open,
  row,
  excludeCaseIds,
  onBulkAdd,
}: AssignBrowseDrawerProps): JSX.Element | null {
  const [shopNo, setShopNo] = useState('');
  const [branchNo, setBranchNo] = useState('');
  const [allBereiche, setAllBereiche] = useState(false);
  const [bereicheFilter, setBereicheFilter] = useState<Set<string>>(() => new Set(row.bereiche));
  const [sortMode, setSortMode] = useState<SortMode>('teile');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const query = useQuery<CaseSearchResult[], Error>({
    queryKey: ['case-search-browse', shopNo, branchNo],
    queryFn: () =>
      searchAssignableCases({
        shopNo: shopNo.trim() || undefined,
        branchNo: branchNo.trim() || undefined,
        limit: 50,
      }),
    enabled: open,
  });

  const excludeSet = useMemo(() => new Set(excludeCaseIds), [excludeCaseIds]);
  const visible = useMemo(() => {
    const rows = (query.data ?? []).filter((r) => !excludeSet.has(r.caseId));
    const bereichFiltered = allBereiche
      ? rows
      : rows.filter((r) => r.bereich === null || bereicheFilter.has(r.bereich));
    const sorted = [...bereichFiltered];
    if (sortMode === 'teile') sorted.sort((a, b) => b.teile - a.teile);
    else if (sortMode === 'prio') {
      sorted.sort((a, b) => Number(b.priorityFlags.length > 0) - Number(a.priorityFlags.length > 0));
    }
    // 'oldest' is already the endpoint's natural order (bookingDate ascending).
    return sorted;
  }, [query.data, excludeSet, allBereiche, bereicheFilter, sortMode]);

  const checked = visible.filter((r) => checkedIds.has(r.caseId));
  const freeMinutes = Math.max(0, row.netCapacityMinutes - row.assignedMinutes);
  const checkedTeile = checked.reduce((sum, r) => sum + r.teile, 0);

  function toggleBereich(b: string): void {
    setBereicheFilter((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  function toggleChecked(caseId: string, isChecked: boolean): void {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(caseId);
      else next.delete(caseId);
      return next;
    });
  }

  function handleBulkAdd(): void {
    if (checked.length === 0) return;
    onBulkAdd(checked);
    setCheckedIds(new Set());
  }

  if (!open) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {row.displayName} · {formatMinutes(freeMinutes)} frei
          </Typography>
          {isManualOnlyTier(row.skillTier) && (
            <Chip size="small" variant="outlined" label="manuelle Zuteilung passend" />
          )}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          {row.bereiche.map((b) => (
            <Chip
              key={b}
              size="small"
              variant={!allBereiche && bereicheFilter.has(b) ? 'filled' : 'outlined'}
              color="primary"
              label={b}
              onClick={() => toggleBereich(b)}
              disabled={allBereiche}
            />
          ))}
          <Chip
            size="small"
            variant={allBereiche ? 'filled' : 'outlined'}
            label="alle Bereiche"
            onClick={() => setAllBereiche((v) => !v)}
          />
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField
            size="small"
            label="Shop"
            value={shopNo}
            onChange={(e) => setShopNo(e.target.value)}
          />
          <TextField
            size="small"
            label="Filiale"
            value={branchNo}
            onChange={(e) => setBranchNo(e.target.value)}
          />
          <Stack direction="row" spacing={0.5}>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <Chip
                key={mode}
                size="small"
                variant={sortMode === mode ? 'filled' : 'outlined'}
                label={SORT_LABELS[mode]}
                onClick={() => setSortMode(mode)}
              />
            ))}
          </Stack>
        </Stack>

        {query.isLoading && <CircularProgress size={20} />}
        {query.isError && (
          <Alert severity="error" variant="outlined">
            Suche fehlgeschlagen: {query.error.message}
          </Alert>
        )}
        {!query.isLoading && !query.isError && visible.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Keine passenden Belege für die aktuellen Filter.
          </Typography>
        )}

        {visible.length > 0 && (
          <Stack sx={{ maxHeight: 320, overflowY: 'auto' }}>
            {visible.slice(0, 20).map((r) => (
              <BelegSearchResultRow
                key={r.caseId}
                result={r}
                checkbox={{
                  checked: checkedIds.has(r.caseId),
                  onChange: (isChecked) => toggleChecked(r.caseId, isChecked),
                }}
              />
            ))}
          </Stack>
        )}
        {visible.length > 20 && (
          <Typography variant="caption" color="text.secondary">
            Weitere Treffer vorhanden — Filter verfeinern.
          </Typography>
        )}

        <Stack direction="row" spacing={2} alignItems="center" sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2">
            {checked.length} ausgewählt · {checkedTeile} Teile
          </Typography>
          <Button
            size="small"
            variant="contained"
            disabled={checked.length === 0}
            onClick={handleBulkAdd}
            sx={{ ml: 'auto' }}
          >
            Auswahl übernehmen
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @paket/teamlead-web exec vitest run src/components/AssignBrowseDrawer.test.tsx`
Expected: PASS (2 tests). If `createQueryClient` is not exported from `@paket/ui`'s public entry, check `packages/ui/src/index.ts` and add the export there first (it is defined in `packages/ui/src/query/query.tsx`; confirm it's re-exported — if not, add `export { createQueryClient } from './query/query.js';` to the package's index and rebuild `@paket/ui`).

- [ ] **Step 5: Commit**

```bash
git add apps/teamlead-web/src/components/AssignBrowseDrawer.tsx apps/teamlead-web/src/components/AssignBrowseDrawer.test.tsx
git commit -m "feat(teamlead-web): add AssignBrowseDrawer (filterable multi-select browse panel)"
```

---

### Task 9: Upgrade `AssignDialog` — live-search dropdown + Durchsuchen toggle

**Files:**
- Modify: `apps/teamlead-web/src/components/AssignDialog.tsx`
- Test: `apps/teamlead-web/src/components/AssignDialog.test.tsx`

**Interfaces:**
- Consumes: `searchAssignableCases`, `searchResultToBelegLookup`, `CaseSearchResult` (Task 6), `BelegSearchResultRow` (Task 7), `AssignBrowseDrawer` (Task 8).
- Produces: the upgraded `AssignDialog` (same public props as today — `AssignDialogProps` unchanged), consumed unchanged by `MitarbeiterBoard.tsx` (no changes needed there).

- [ ] **Step 1: Write the failing tests**

Create `apps/teamlead-web/src/components/AssignDialog.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders, createQueryClient } from '@paket/ui';
import { AssignDialog } from './AssignDialog.js';
import * as belege from '../data/belege.js';
import type { BoardRow } from '../data/types.js';
import type { BelegLookup, CaseSearchResult } from '../data/belege.js';

vi.mock('../data/belege.js', async () => {
  const actual = await vi.importActual<typeof import('../data/belege.js')>('../data/belege.js');
  return {
    ...actual,
    lookupBeleg: vi.fn(),
    searchAssignableCases: vi.fn(),
  };
});

const ROW: BoardRow = {
  employeeId: 'ma-701',
  displayName: 'Timo',
  skillTier: 'basis',
  plannedTeile: 0,
  plannedHours: 0,
  utilisationPct: 0,
  assignedMinutes: 0,
  netCapacityMinutes: 271,
  effortPoints: 0,
  openIssues: 0,
  paused: false,
  bereiche: ['Regal'],
  cases: [],
};

function notFound(): BelegLookup {
  return {
    found: false,
    caseId: null,
    weBelegNo: null,
    status: null,
    bereich: null,
    teile: null,
    estimatedMinutes: null,
    assignedEmployeeName: null,
    assignable: false,
    reasonCode: 'not_found',
    deliveryGroup: null,
  };
}

function searchResult(partial: Partial<CaseSearchResult> & Pick<CaseSearchResult, 'caseId' | 'weBelegNo'>): CaseSearchResult {
  return {
    bereich: 'Regal',
    goodsType: null,
    teile: 15,
    estimatedMinutes: 20,
    storageLocationCode: 'R41',
    priorityFlags: [],
    deliveryGroup: null,
    ...partial,
  };
}

function renderDialog(onConfirm = vi.fn()) {
  const onClose = vi.fn();
  const client = createQueryClient({ retry: 0 });
  render(
    <AppProviders queryClient={client}>
      <AssignDialog open row={ROW} onConfirm={onConfirm} onClose={onClose} />
    </AppProviders>,
  );
  return { onConfirm, onClose };
}

describe('AssignDialog', () => {
  beforeEach(() => {
    vi.mocked(belege.lookupBeleg).mockResolvedValue(notFound());
    vi.mocked(belege.searchAssignableCases).mockResolvedValue([]);
  });

  it('still renders the exact-match not_found message when nothing matches', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText('WE-Belegnummer'), 'WE-DOES-NOT-EXIST');
    await waitFor(() =>
      expect(screen.getByText('Kein Beleg mit dieser WE-Belegnummer gefunden.')).toBeTruthy(),
    );
  });

  it('shows ranked live-search results below the field and adds one on click', async () => {
    vi.mocked(belege.searchAssignableCases).mockResolvedValue([
      searchResult({ caseId: 'case-9', weBelegNo: 'WE-9001' }),
    ]);
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('WE-Belegnummer'), 'WE-90');
    await waitFor(() => expect(screen.getByText('WE-9001')).toBeTruthy());

    await user.click(screen.getByText('WE-9001'));
    expect(screen.getByText(/WE-9001/)).toBeTruthy();
    expect(screen.getByText('Bündel anlegen & zuweisen (1)')).toBeTruthy();
  });

  it('opens the browse drawer and bulk-adds multiple Belege to the same tray', async () => {
    vi.mocked(belege.searchAssignableCases).mockImplementation(async (params) => {
      // The dropdown query passes `q`; the drawer's browse query does not.
      if (params.q) return [];
      return [
        searchResult({ caseId: 'case-1', weBelegNo: 'WE-1001' }),
        searchResult({ caseId: 'case-2', weBelegNo: 'WE-1002' }),
      ];
    });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText(/Durchsuchen/));
    await waitFor(() => expect(screen.getByText('WE-1001')).toBeTruthy());
    await user.click(screen.getByLabelText('WE-1001 auswählen'));
    await user.click(screen.getByLabelText('WE-1002 auswählen'));
    await user.click(screen.getByRole('button', { name: /Auswahl übernehmen/ }));

    expect(screen.getByText('Bündel anlegen & zuweisen (2)')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @paket/teamlead-web exec vitest run src/components/AssignDialog.test.tsx`
Expected: FAIL — dropdown/drawer elements don't exist yet on the current `AssignDialog`.

- [ ] **Step 3: Modify `AssignDialog.tsx`**

Apply these changes to `apps/teamlead-web/src/components/AssignDialog.tsx`:

1. Add imports (after the existing `import { lookupBeleg, type BelegLookup } from '../data/belege.js';` line):

```typescript
import { searchAssignableCases, searchResultToBelegLookup, type CaseSearchResult } from '../data/belege.js';
import { BelegSearchResultRow } from './BelegSearchResultRow.js';
import { AssignBrowseDrawer } from './AssignBrowseDrawer.js';
```

2. Add new local state, right after the existing `const [selected, setSelected] = useState<BelegLookup[]>([]);` line:

```typescript
  const [dropdownIndex, setDropdownIndex] = useState(-1);
  const [dropdownClosed, setDropdownClosed] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
```

3. Reset the new state in the existing `useEffect` that clears state `if (open) { ... }` — add these three lines alongside the existing resets:

```typescript
      setDropdownIndex(-1);
      setDropdownClosed(false);
      setBrowseOpen(false);
```

4. Add a second query right after the existing `lookup` query (`const lookup = useQuery<BelegLookup, Error>({...});`):

```typescript
  const search = useQuery<CaseSearchResult[], Error>({
    queryKey: ['case-search', lookupTerm],
    queryFn: () => searchAssignableCases({ q: lookupTerm, limit: 8 }),
    enabled: open && lookupTerm.length > 0,
  });
```

5. After the existing `const pendingLookup = ...` line, add:

```typescript
  const alreadySelectedIds = new Set(selected.map((s) => s.caseId));
  const searchResults = (search.data ?? []).filter((r) => !alreadySelectedIds.has(r.caseId));
  const dropdownVisible =
    !dropdownClosed && lookupTerm.length > 0 && !search.isFetching && searchResults.length > 0;
```

6. Add a helper function alongside the existing `addToSelection`/`removeFromSelection` functions:

```typescript
  function addSearchResultToSelection(result: CaseSearchResult): void {
    setSelected((prev) => [...prev, searchResultToBelegLookup(result)]);
    setWeBelegNo('');
    setLookupTerm('');
    setDropdownIndex(-1);
  }

  function addBrowseResultsToSelection(results: CaseSearchResult[]): void {
    setSelected((prev) => [...prev, ...results.map(searchResultToBelegLookup)]);
    setBrowseOpen(false);
  }
```

7. Replace the existing `TextField`'s `onChange` and `onKeyDown` handlers (the `WE-Belegnummer` field) with:

```tsx
          <TextField
            autoFocus
            fullWidth
            label="WE-Belegnummer"
            placeholder="z. B. WE-2026-01234"
            value={weBelegNo}
            onChange={(e) => {
              setWeBelegNo(e.target.value);
              setDropdownIndex(-1);
              setDropdownClosed(false);
            }}
            helperText={
              pendingLookup
                ? 'Beleg wird geprüft …'
                : 'Nummer vom Beleg eingeben — wird live geprüft. Mehrere Belege für ein Bündel: nacheinander hinzufügen.'
            }
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && dropdownVisible) {
                e.preventDefault();
                setDropdownIndex((i) => Math.min(i + 1, searchResults.length - 1));
              } else if (e.key === 'ArrowUp' && dropdownVisible) {
                e.preventDefault();
                setDropdownIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Escape' && dropdownVisible) {
                setDropdownClosed(true);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (dropdownVisible && dropdownIndex >= 0 && searchResults[dropdownIndex]) {
                  addSearchResultToSelection(searchResults[dropdownIndex]);
                } else if (assignable) {
                  addToSelection();
                }
              }
            }}
          />

          {dropdownVisible && (
            <Paper variant="outlined" sx={{ maxHeight: 280, overflowY: 'auto' }}>
              {searchResults.map((r, i) => (
                <BelegSearchResultRow
                  key={r.caseId}
                  result={r}
                  highlighted={i === dropdownIndex}
                  onSelect={() => addSearchResultToSelection(r)}
                />
              ))}
            </Paper>
          )}
```

(This replaces the single existing `<TextField ... />` self-closing element with the block above — the rest of the dialog, from `{lookup.isError && ...}` onward, is unchanged.)

8. Add the "Durchsuchen" toggle + drawer, immediately after the closing `)}` of the existing `overCapacity` warning block and before the "Neues Bündel …" `Paper` block:

```tsx
          <Button size="small" onClick={() => setBrowseOpen((v) => !v)} sx={{ alignSelf: 'flex-start' }}>
            {browseOpen ? 'Durchsuchen schließen' : 'Durchsuchen & mehrere auswählen'}
          </Button>

          <AssignBrowseDrawer
            open={browseOpen}
            row={row}
            excludeCaseIds={selected.map((s) => s.caseId).filter((id): id is string => id !== null)}
            onBulkAdd={addBrowseResultsToSelection}
          />
```

9. A3: point at near-misses when the exact lookup comes back `not_found` but the
   ranked search still found something. Directly below the existing
   `{!pendingLookup && result && !result.assignable && (...)}` Alert block (the one
   rendering `lookupMessage(result)`), add:

```tsx
          {!pendingLookup && result?.reasonCode === 'not_found' && dropdownVisible && (
            <Typography variant="caption" color="text.secondary">
              Ähnliche Belege siehe Liste unten.
            </Typography>
          )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @paket/teamlead-web exec vitest run src/components/AssignDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full frontend test suite + typecheck**

Run: `pnpm --filter @paket/teamlead-web test`
Expected: all tests pass, including the pre-existing `AssignDialog`-adjacent suites (`SplitDialog.test.tsx`, `App.test.tsx`) unaffected.

Run: `pnpm --filter @paket/teamlead-web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/teamlead-web/src/components/AssignDialog.tsx apps/teamlead-web/src/components/AssignDialog.test.tsx
git commit -m "feat(teamlead-web): live-search dropdown + Durchsuchen drawer in AssignDialog"
```

---

### Task 10: Manual browser verification (compact dialog check)

**Files:** none (verification only).

- [ ] **Step 1: Start the stack**

Run: `pnpm dev` (from repo root — starts backend :3000, teamlead-web :5174, employee-pwa :5175). If `.env`/dev tokens are missing, run `pnpm dev:setup` first.

- [ ] **Step 2: Exercise the flow in a browser**

Navigate to the teamlead-web Mitarbeiterboard, open "Beleg(e) zuweisen" for any employee row, and verify:
- Typing a partial/garbled WE-Nr shows a ranked dropdown of matches (not just "nicht gefunden").
- Clicking a dropdown result adds it to the tray, clears the field.
- Typing an exact WE-Nr still shows the existing plausibility card/message untouched.
- "Durchsuchen & mehrere auswählen" expands a compact drawer (dialog grows only when opened); Bereich chips pre-check the employee's own Bereiche; checking rows and clicking "Auswahl übernehmen" adds them all to the tray and collapses the drawer.
- The dialog never becomes a "giant modal" — closed-drawer state matches today's footprint.

- [ ] **Step 3: Stop the dev stack**

Run: `Ctrl+C` in the `pnpm dev` terminal (or kill the relevant background job).

---

### Task 11: Docs — architecture diagrams + handbook

**Files:**
- Modify: `docs/architecture/src/c3-backend-components.mmd`
- Modify: `docs/architecture/src/c3-teamlead-components.mmd`
- Modify: `docs/handbook/b3-mitarbeiterboard.md`
- Regenerate: `docs/architecture/rendered/c3-backend-components.svg`, `docs/architecture/rendered/c3-teamlead-components.svg`

- [ ] **Step 1: Update `c3-backend-components.mmd`**

In `docs/architecture/src/c3-backend-components.mmd`, find the `tlCtrl["TeamleadController<br/>...` node text and add the new route to its label list (append after `· cases/lookup (WE-Nr)`):

```
· cases/lookup (WE-Nr) · cases/search (A1/A2/B1 assign-flow search+browse)
```

Find the `tlRead["TeamleadReadService<br/><i>dashboard · board · capacity · kpis · pool (server-filter/sort/pagination) · lookup · detail</i>"]` node and update its label to:

```
dashboard · board · capacity · kpis · pool (server-filter/sort/pagination) · lookup · search (ranked, assignable-only) · detail
```

- [ ] **Step 2: Update `c3-teamlead-components.mmd`**

In `docs/architecture/src/c3-teamlead-components.mmd`, find the `shared["components/<br/><i>CaseActionMenu ... AssignDialog ...` node and update the `AssignDialog` mention:

```
AssignDialog (live-search combobox + Durchsuchen browse drawer, A1/A2/B1)
```

Also add the two new components to the same node's list: `BelegSearchResultRow`, `AssignBrowseDrawer`.

- [ ] **Step 3: Re-render the diagrams**

Run: `cd docs/architecture && ./render.sh c3-backend-components && ./render.sh c3-teamlead-components`
Expected: `rendered/c3-backend-components.svg` and `rendered/c3-teamlead-components.svg` are regenerated (check their mtimes changed).

- [ ] **Step 4: Update the handbook**

In `docs/handbook/b3-mitarbeiterboard.md`, in the "Bündel anlegen: mehrere Belege in einem Schritt zuweisen (A1/A2)" section, after step 2 (`Geben Sie die 'WE-Belegnummer' ein ...`), insert a new step:

```markdown
2a. Während Sie tippen, erscheint darunter eine **Trefferliste** mit ähnlichen Belegen (WE-Nr,
    Bereich, Teile, Lieferung) — auch bei einer nicht exakten Eingabe. Klick oder Enter fügt den
    markierten Treffer zur Auswahl hinzu.
```

And after the existing numbered list (before the "## " of the next section), add a new subsection:

```markdown
## Durchsuchen & mehrere auswählen

Statt eine WE-Nummer einzutippen, kann auch **`'Durchsuchen & mehrere auswählen'`** geöffnet
werden: ein Filterbereich (Bereich-Chips, Shop, Filiale, Sortierung) mit einer Liste, in der
mehrere Belege per Checkbox markiert werden. **`'Auswahl übernehmen'`** überträgt alle markierten
Belege in dieselbe Auswahl wie oben — Bestätigung erfolgt danach genau wie gewohnt.
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/src/c3-backend-components.mmd docs/architecture/src/c3-teamlead-components.mmd \
  docs/architecture/rendered/c3-backend-components.svg docs/architecture/rendered/c3-teamlead-components.svg \
  docs/handbook/b3-mitarbeiterboard.md
git commit -m "docs: reflect assign-flow search + browse in architecture diagrams and handbook"
```

---

### Task 12: Final quality gate

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck` (from repo root)
Expected: 13/13 packages green.

- [ ] **Step 2: Full lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 3: Full unit test suite**

Run: `pnpm test`
Expected: all green, including the new `case-search.test.ts`, `AssignBrowseDrawer.test.tsx`, `AssignDialog.test.tsx`.

- [ ] **Step 4: Backend integration suite**

Run: `pnpm --filter @paket/backend-api test:int`
Expected: all green, including the new `case-search.int.test.ts` (requires Docker).

- [ ] **Step 5: Build everything**

Run: `pnpm build`
Expected: all packages/apps build clean.

- [ ] **Step 6: Confirm the OpenAPI drift gate is clean**

Run: `pnpm --filter @paket/api-client test`
Expected: `openapi-drift.test.ts` (or equivalent) passes — the checked-in `packages/api-client/openapi/openapi.json` matches what the backend currently emits.

- [ ] **Step 7: Final commit (if anything above required fixes)**

```bash
git add -A
git commit -m "chore: quality gate fixes for assign-flow search + browse"
```

(Skip this step if Steps 1–6 were already clean with no further changes.)
