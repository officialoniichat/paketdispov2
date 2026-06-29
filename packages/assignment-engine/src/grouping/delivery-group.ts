import type { Id } from '@paket/domain-types';

/**
 * Delivery-Group detection (Teamlead-Anforderung Punkt 1, Konzept
 * `docs/concept/delivery-note-grouping-concept.md`). A supplier may ship ONE physical
 * delivery split across several Lieferscheine; because the warehouse books per
 * Lieferschein and labels each Beleg individually, those Belege must be recognised as
 * belonging together so a single person processes the whole group — otherwise a
 * colleague keeps hunting for a Beleg someone else already took.
 *
 * Pure and deterministic (no fetch, no clock, no randomness): the same pool always
 * yields the same groups, so the Teamlead "Neu berechnen"/Vorschau stays reproducible.
 */

/** Grouping tuning (§11 Regelpflege). Mirrored into {@link EngineConfig.grouping}. */
export interface GroupingConfig {
  /** Master switch — when false, {@link detectDeliveryGroups} returns no groups. */
  enabled: boolean;
  /**
   * Maximum numeric distance between two consecutive (sorted) `weBelegNo` values for
   * them to still count as one run. `1` = strictly consecutive (…119, …120, …121).
   * A gap larger than this breaks the run.
   */
  maxWeBelegGap: number;
}

export const DEFAULT_GROUPING_CONFIG: GroupingConfig = {
  enabled: true,
  maxWeBelegGap: 1,
};

/** Minimal case shape grouping needs — kept free of the engine's EnrichedCase. */
export interface DeliveryGroupInput {
  id: Id;
  weBelegNo: string;
  deliveryNoteNo?: string | null;
}

/** Which signal linked a group together (informational, surfaced in diagnostics/UI). */
export type DeliveryGroupReason = 'delivery_note' | 'beleg_run' | 'mixed';

/** A set of Belege recognised as one physical delivery (always ≥ 2 members). */
export interface DeliveryGroup {
  /** Stable id `dg-<smallest weBelegNo digits>` of the component. */
  id: string;
  /** Member case ids, sorted by numeric weBelegNo then id (deterministic). */
  caseIds: Id[];
  reason: DeliveryGroupReason;
}

/** Reverse lookup built from groups — caseId → group id, and group id → member count. */
export interface DeliveryGroupIndex {
  groupIdByCaseId: ReadonlyMap<Id, string>;
  sizeByGroupId: ReadonlyMap<string, number>;
}

/**
 * Parse a `weBelegNo` to a comparable integer by stripping every non-digit
 * (`"3.551.119"` → `3551119`). Returns null when there is no digit or the number is
 * not a safe integer, so such Belege simply never join a run.
 */
function parseWeBelegNo(weBelegNo: string): number | null {
  const digits = weBelegNo.replace(/\D/g, '');
  if (digits.length === 0) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Detect delivery groups by Union-Find over two OR-combined signals:
 *   (A) identical non-empty `deliveryNoteNo`, and
 *   (B) a consecutive `weBelegNo` run within `config.maxWeBelegGap`.
 * Connected components with ≥ 2 members become groups; singletons are not groups.
 */
export function detectDeliveryGroups(
  cases: readonly DeliveryGroupInput[],
  config: GroupingConfig = DEFAULT_GROUPING_CONFIG,
): DeliveryGroup[] {
  if (!config.enabled || cases.length < 2) return [];

  const n = cases.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    let cursor = x;
    while (parent[cursor] !== root) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Attach to the smaller index root → deterministic, index-stable components.
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  };

  const noteLinked = new Set<number>();
  const runLinked = new Set<number>();

  // Signal A: same deliveryNoteNo (trimmed, non-empty).
  const byNote = new Map<string, number[]>();
  cases.forEach((c, i) => {
    const note = c.deliveryNoteNo?.trim();
    if (note) {
      const arr = byNote.get(note);
      if (arr) arr.push(i);
      else byNote.set(note, [i]);
    }
  });
  for (const indices of byNote.values()) {
    if (indices.length < 2) continue;
    for (let k = 1; k < indices.length; k++) {
      union(indices[0]!, indices[k]!);
      noteLinked.add(indices[0]!);
      noteLinked.add(indices[k]!);
    }
  }

  // Signal B: consecutive weBelegNo run within the configured gap.
  const parsed = cases
    .map((c, i) => ({ i, num: parseWeBelegNo(c.weBelegNo) }))
    .filter((x): x is { i: number; num: number } => x.num !== null)
    .sort((a, b) => a.num - b.num || a.i - b.i);
  for (let k = 1; k < parsed.length; k++) {
    const prev = parsed[k - 1]!;
    const cur = parsed[k]!;
    if (cur.num - prev.num <= config.maxWeBelegGap) {
      union(prev.i, cur.i);
      runLinked.add(prev.i);
      runLinked.add(cur.i);
    }
  }

  // Materialise components.
  const membersByRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = membersByRoot.get(root);
    if (arr) arr.push(i);
    else membersByRoot.set(root, [i]);
  }

  const groups: DeliveryGroup[] = [];
  for (const indices of membersByRoot.values()) {
    if (indices.length < 2) continue;
    const sorted = indices
      .map((i) => ({ i, num: parseWeBelegNo(cases[i]!.weBelegNo), id: cases[i]!.id }))
      .sort((a, b) => {
        const an = a.num ?? Number.POSITIVE_INFINITY;
        const bn = b.num ?? Number.POSITIVE_INFINITY;
        if (an !== bn) return an - bn;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    const minNum = sorted[0]!.num;
    const groupId = `dg-${minNum ?? sorted[0]!.id}`;
    const hasNote = indices.some((i) => noteLinked.has(i));
    const hasRun = indices.some((i) => runLinked.has(i));
    const reason: DeliveryGroupReason =
      hasNote && hasRun ? 'mixed' : hasNote ? 'delivery_note' : 'beleg_run';
    groups.push({ id: groupId, caseIds: sorted.map((s) => s.id), reason });
  }

  groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return groups;
}

/** Build the caseId→groupId / groupId→size lookups from detected groups. */
export function indexDeliveryGroups(groups: readonly DeliveryGroup[]): DeliveryGroupIndex {
  const groupIdByCaseId = new Map<Id, string>();
  const sizeByGroupId = new Map<string, number>();
  for (const group of groups) {
    sizeByGroupId.set(group.id, group.caseIds.length);
    for (const caseId of group.caseIds) groupIdByCaseId.set(caseId, group.id);
  }
  return { groupIdByCaseId, sizeByGroupId };
}
