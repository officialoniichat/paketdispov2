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
