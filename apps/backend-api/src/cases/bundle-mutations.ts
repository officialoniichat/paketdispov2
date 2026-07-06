/**
 * Shared transactional bundle-mutation helpers.
 *
 * The Teamlead §8.4 overrides (withdraw/add/reorder) and the employee
 * Parkposition (B4, „Rest parken") mutate the same AssignmentBundle invariants:
 * item sequences stay gapless, route stops follow the case order, and the
 * bundle's planned effort is the sum of its cases. Single source here so the
 * two services don't carry byte-identical private copies.
 */
import { Prisma } from '@prisma/client';

export type PrismaTx = Prisma.TransactionClient;

/** Rewrite AssignmentItem.sequence so it matches `orderedCaseIds`. */
export async function resequenceItems(
  tx: PrismaTx,
  bundleId: string,
  orderedCaseIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedCaseIds.length; i++) {
    await tx.assignmentItem.updateMany({
      where: { bundleId, caseId: orderedCaseIds[i] },
      data: { sequence: i },
    });
  }
}

/**
 * Re-sequence route stops to follow the new case order: a stop's rank is the
 * earliest index (in `orderedCaseIds`) of any case it serves (via orderIds);
 * stops that touch no listed case keep their relative order at the tail.
 */
export async function resequenceRouteStops(
  tx: PrismaTx,
  bundleId: string,
  orderedCaseIds: string[],
): Promise<void> {
  const stops = await tx.routeStop.findMany({
    where: { bundleId },
    orderBy: { sequence: 'asc' },
  });
  if (stops.length === 0) return;
  const rankOf = new Map(orderedCaseIds.map((id, idx) => [id, idx]));
  const ranked = stops.map((s, originalIdx) => {
    const ranks = s.orderIds
      .map((id) => rankOf.get(id))
      .filter((r): r is number => r !== undefined);
    const primary = ranks.length > 0 ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
    return { id: s.id, primary, originalIdx };
  });
  ranked.sort((a, b) => a.primary - b.primary || a.originalIdx - b.originalIdx);
  // Two-phase write to avoid colliding with the @@unique([bundleId, sequence]):
  // first park every stop at a negative slot, then assign the final 0..n order.
  for (const [i, stop] of ranked.entries()) {
    await tx.routeStop.update({ where: { id: stop.id }, data: { sequence: -(i + 1) } });
  }
  for (const [i, stop] of ranked.entries()) {
    await tx.routeStop.update({ where: { id: stop.id }, data: { sequence: i } });
  }
}

/** Sum estimatedMinutes of the given cases — the bundle's planned effort. */
export async function recomputeEffort(tx: PrismaTx, caseIds: string[]): Promise<number> {
  if (caseIds.length === 0) return 0;
  const agg = await tx.goodsReceiptCase.aggregate({
    where: { id: { in: caseIds } },
    _sum: { estimatedMinutes: true },
  });
  return agg._sum.estimatedMinutes ?? 0;
}
