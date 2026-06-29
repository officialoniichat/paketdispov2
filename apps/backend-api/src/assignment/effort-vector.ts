import { effortInputVectorSchema, handlingClassFromLocationKind } from '@paket/domain-types';
import type {
  EffortInputVector,
  GoodsReceiptCheckMode,
  LocationKind,
} from '@paket/domain-types';

/**
 * Build the §8.2 {@link EffortInputVector} for a case from its persisted work
 * instruction + position instructions + storage class. This is what finally wires the
 * cockpit-edited effort parameters into the LIVE distribution: the engine recomputes a
 * case's effort via `computeEffort(vector, config.effort)` whenever a vector is present.
 *
 * A vector is only built when the case has a {@link WorkInstructionHeader} (its effort
 * drivers are known). Cases without one return `undefined`, so the engine falls back to
 * the precomputed `estimatedMinutes` — keeping not-yet-instructionalised cases unchanged.
 *
 * Field sources (Anhang D):
 *  - totalQuantity            ← GoodsReceiptCase.totalQuantity
 *  - wgrCodes                 ← distinct ReceiptPosition.wgr
 *  - priceLabelPrintRequired  ← WorkInstructionHeader.priceLabelPrintRequired
 *  - priceLabelAttachCount    ← #PositionInstruction.priceLabelAttachRequired
 *  - securityRequiredCount    ← #PositionInstruction.securityRequired
 *  - onlineRelevantCount      ← #PositionInstruction.onlineHandlingRequired
 *  - redPriceRequired         ← any PositionInstruction.redPriceRequired
 *  - goodsReceiptCheckMode/%  ← WorkInstructionHeader
 *  - handlingClass            ← storageLocation.kind (haengebahn→hanging_goods, palette_*→bulky, else normal)
 */

/** Minimal structural shape the builder needs (a Prisma case row satisfies it). */
export interface EffortVectorCaseRow {
  id: string;
  totalQuantity: number;
  storageLocation: { kind: LocationKind };
  workInstruction: {
    priceLabelPrintRequired: boolean;
    goodsReceiptCheckMode: GoodsReceiptCheckMode;
    goodsReceiptCheckPercentage: number | null;
  } | null;
  positions: ReadonlyArray<{
    wgr: string;
    instruction: {
      priceLabelAttachRequired: boolean;
      securityRequired: boolean;
      onlineHandlingRequired: boolean;
      redPriceRequired: boolean | null;
    } | null;
  }>;
}

type PositionInstruction = NonNullable<EffortVectorCaseRow['positions'][number]['instruction']>;

/** Build the effort vector for one case, or `undefined` when it has no work instruction. */
export function buildEffortVector(row: EffortVectorCaseRow): EffortInputVector | undefined {
  const wi = row.workInstruction;
  if (!wi) return undefined;

  const countInstr = (pred: (i: PositionInstruction) => boolean): number =>
    row.positions.filter((p) => p.instruction != null && pred(p.instruction)).length;

  return effortInputVectorSchema.parse({
    caseId: row.id,
    totalQuantity: row.totalQuantity,
    wgrCodes: [...new Set(row.positions.map((p) => p.wgr))],
    priceLabelPrintRequired: wi.priceLabelPrintRequired,
    priceLabelAttachPositionCount: countInstr((i) => i.priceLabelAttachRequired),
    securityRequiredPositionCount: countInstr((i) => i.securityRequired),
    onlineRelevantPositionCount: countInstr((i) => i.onlineHandlingRequired),
    redPriceRequired: row.positions.some((p) => p.instruction?.redPriceRequired === true),
    goodsReceiptCheckMode: wi.goodsReceiptCheckMode,
    goodsReceiptCheckPercentage: wi.goodsReceiptCheckPercentage ?? undefined,
    handlingClass: handlingClassFromLocationKind(row.storageLocation.kind),
  });
}

/** Build the case-id → vector map for the cases that have a work instruction. */
export function buildEffortVectors(
  rows: readonly EffortVectorCaseRow[],
): Map<string, EffortInputVector> {
  const map = new Map<string, EffortInputVector>();
  for (const row of rows) {
    const vector = buildEffortVector(row);
    if (vector) map.set(row.id, vector);
  }
  return map;
}
