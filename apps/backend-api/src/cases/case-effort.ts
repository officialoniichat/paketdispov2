import type { Prisma } from '@prisma/client';
import { computeEffortBreakdown, type EffortComponents, type EffortConfig } from '@paket/assignment-engine';
import { buildEffortVector, type EffortVectorCaseRow } from '../assignment/effort-vector.js';

/**
 * Shared effort resolution for the READ models (Belegdetail/Board/Pool). It mirrors the
 * planning path exactly: when a case has a work instruction, its effort is recomputed
 * live from the cockpit-edited parameters via the engine's {@link computeEffortBreakdown}
 * (single source — same formula the distribution uses). Cases without a work instruction
 * keep their stored `estimatedMinutes`/`effortPoints` (ingestion estimate). This keeps the
 * displayed numbers consistent with the actual distribution instead of showing stale data.
 */

/** Prisma include that loads the case relations {@link resolveCaseEffort} needs. */
export const caseEffortInclude = {
  storageLocation: true,
  workInstruction: true,
  positions: { include: { instruction: true }, orderBy: { positionNo: 'asc' } },
} satisfies Prisma.GoodsReceiptCaseInclude;

/** A case row carrying the stored fallback values + the effort-driver relations. */
export type ResolvableCaseRow = EffortVectorCaseRow & {
  estimatedMinutes: number;
  effortPoints: number;
};

export interface ResolvedCaseEffort {
  /** Effective Bearbeitungszeit in minutes (live-computed, or stored fallback). */
  minutes: number;
  /** Effective Aufwandspunkte. */
  points: number;
  /** `true` when computed live from a work instruction; `false` = stored fallback. */
  computed: boolean;
  /** Per-driver minute breakdown when computed; `null` for the stored fallback. */
  components: EffortComponents | null;
}

/** Resolve a case's effective effort: live `computeEffort` when instructionalised, else stored. */
export function resolveCaseEffort(row: ResolvableCaseRow, effort: EffortConfig): ResolvedCaseEffort {
  const vector = buildEffortVector(row);
  if (!vector) {
    return { minutes: row.estimatedMinutes, points: row.effortPoints, computed: false, components: null };
  }
  const breakdown = computeEffortBreakdown(vector, effort);
  return {
    minutes: breakdown.minutes,
    points: breakdown.points,
    computed: true,
    components: breakdown.components,
  };
}
