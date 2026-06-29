import type { Id } from '@paket/domain-types';

/**
 * Delivery-Group detection (Teamlead-Anforderung Punkt 1, Konzept
 * `docs/concept/lieferschein-gruppierung-concept.md`). A supplier consolidates several
 * orders — each its own Lieferschein — into ONE physical Paket; the warehouse books and
 * labels per Lieferschein, so one carton becomes several Belege. They must be recognised
 * as one delivery and processed by a single person — otherwise a colleague keeps hunting
 * for a Paket someone else already opened.
 *
 * Detection is TIERED by reliability; the strongest signal that fires sets the group's
 * confidence:
 *   - T1 `source`  — ProHandel „Lieferschein X von N" key      → confirmed
 *   - T2 `note`    — identical deliveryNoteNo                    → likely
 *   - T3 `run`     — consecutive weBelegNo run (hardened by day/Bereich) → suspected
 *   - manual       — Teamlead-Korrektur (`manualDeliveryGroupKey`) → locked (always wins)
 *
 * Pure and deterministic (no fetch, no clock, no randomness): the same pool always yields
 * the same groups, so „Neu berechnen"/Vorschau stays reproducible.
 */

/** Grouping tuning (§11 Regelpflege). Mirrored 1:1 from {@link GroupingRuleConfig}. */
export interface GroupingConfig {
  /** Master switch — when false, {@link detectDeliveryGroups} returns no groups. */
  enabled: boolean;
  /** T1: trust the source group key / „X von N" (confirmed). */
  useSourceKey: boolean;
  /** T2: link Belege sharing the same deliveryNoteNo (likely). */
  useDeliveryNote: boolean;
  /** T3: link a consecutive weBelegNo run (suspected). */
  useBelegRun: boolean;
  /** Max numeric distance between two consecutive `weBelegNo` to still count as one run. */
  maxWeBelegGap: number;
  /** Harden T3: a run only links Belege booked on the SAME day. */
  runRequiresSameDay: boolean;
  /** Harden T3: a run only links Belege of the SAME Bereich/section. */
  runRequiresSameSection: boolean;
  /** When false, suspected (T3-only) groups are flagged for the engine to withhold. */
  autoDistributeSuspected: boolean;
}

/**
 * Pure-engine default. Note `autoDistributeSuspected: true` here — the neutral engine
 * distributes everything; the PRODUCTION policy (domain-types `DEFAULT_RULE_CONFIG`)
 * overrides it to `false` to withhold suspected groups (same engine-vs-app split as
 * Schichtende: engine cutoff 0 / app 120).
 */
export const DEFAULT_GROUPING_CONFIG: GroupingConfig = {
  enabled: true,
  useSourceKey: true,
  useDeliveryNote: true,
  useBelegRun: true,
  maxWeBelegGap: 1,
  runRequiresSameDay: true,
  runRequiresSameSection: true,
  autoDistributeSuspected: true,
};

/** Minimal case shape grouping needs — kept free of the engine's EnrichedCase. */
export interface DeliveryGroupInput {
  id: Id;
  weBelegNo: string;
  deliveryNoteNo?: string | null;
  /** T1 source key + expected total N (from „Lieferschein X von N"). */
  deliverySourceGroupKey?: string | null;
  deliverySourceGroupSize?: number | null;
  /** Teamlead-Korrektur: `grp:<key>` merges, `solo:<id>` isolates. */
  manualDeliveryGroupKey?: string | null;
  /** Day (ISO date) for the T3 same-day guard. */
  bookingDate?: string | null;
  /** Bereich/section for the T3 same-section guard (numeric section code or string). */
  section?: string | number | null;
}

/** Which signal linked a group; `mixed` = more than one tier contributed. */
export type DeliveryGroupSignal = 'source' | 'note' | 'run' | 'manual' | 'mixed';

/** How trustworthy the grouping is — drives the UI colour and auto-distribution. */
export type DeliveryGroupConfidence = 'confirmed' | 'likely' | 'suspected' | 'locked';

/** A set of Belege recognised as one physical delivery (always ≥ 2 members). */
export interface DeliveryGroup {
  /** Stable id: `dg-<min weBelegNo>` (auto) or `dg-m-<key>` (manual). */
  id: string;
  /** Member case ids, sorted by numeric weBelegNo then id (deterministic). */
  caseIds: Id[];
  signal: DeliveryGroupSignal;
  confidence: DeliveryGroupConfidence;
  /** Expected total from „X von N" when known; lets the UI show „3 von 4 da · 1 fehlt". */
  expectedSize?: number;
  /** Members currently present in the pool (= `caseIds.length`). */
  presentSize: number;
  /** True for Teamlead-confirmed/merged groups — frozen against re-detection. */
  locked: boolean;
}

/** Reverse lookups built from groups. */
export interface DeliveryGroupIndex {
  groupIdByCaseId: ReadonlyMap<Id, string>;
  sizeByGroupId: ReadonlyMap<string, number>;
  groupById: ReadonlyMap<string, DeliveryGroup>;
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

const MANUAL_GROUP_PREFIX = 'grp:';
const MANUAL_SOLO_PREFIX = 'solo:';

/** Build a group from a fixed member set; returns null for fewer than two members. */
function buildGroup(
  cases: readonly DeliveryGroupInput[],
  indices: readonly number[],
  signal: DeliveryGroupSignal,
  confidence: DeliveryGroupConfidence,
  locked: boolean,
  idOverride?: string,
): DeliveryGroup | null {
  if (indices.length < 2) return null;
  const sorted = indices
    .map((i) => ({ i, num: parseWeBelegNo(cases[i]!.weBelegNo), id: cases[i]!.id }))
    .sort((a, b) => {
      const an = a.num ?? Number.POSITIVE_INFINITY;
      const bn = b.num ?? Number.POSITIVE_INFINITY;
      if (an !== bn) return an - bn;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const expected = indices
    .map((i) => cases[i]!.deliverySourceGroupSize ?? null)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  const expectedSize = expected.length > 0 ? Math.max(...expected) : undefined;
  return {
    id: idOverride ?? `dg-${sorted[0]!.num ?? sorted[0]!.id}`,
    caseIds: sorted.map((s) => s.id),
    signal,
    confidence,
    expectedSize,
    presentSize: sorted.length,
    locked,
  };
}

/**
 * Detect delivery groups. Teamlead-corrected cases (`manualDeliveryGroupKey`) are
 * authoritative and frozen; the remaining cases run through tiered Union-Find over the
 * enabled signals. Connected components with ≥ 2 members become groups.
 */
export function detectDeliveryGroups(
  cases: readonly DeliveryGroupInput[],
  config: GroupingConfig = DEFAULT_GROUPING_CONFIG,
): DeliveryGroup[] {
  if (!config.enabled || cases.length < 2) return [];

  const groups: DeliveryGroup[] = [];

  // ── Manual overrides (locked) — authoritative, removed from the auto pool ───────────
  const manualMembers = new Map<string, number[]>();
  const isManual = new Array<boolean>(cases.length).fill(false);
  cases.forEach((c, i) => {
    const key = c.manualDeliveryGroupKey?.trim();
    if (!key) return;
    isManual[i] = true;
    if (key.startsWith(MANUAL_GROUP_PREFIX)) {
      const arr = manualMembers.get(key);
      if (arr) arr.push(i);
      else manualMembers.set(key, [i]);
    }
    // `solo:` keys isolate a case — never grouped, just excluded from auto.
  });
  for (const [key, indices] of manualMembers) {
    const id = `dg-m-${key.slice(MANUAL_GROUP_PREFIX.length)}`;
    const group = buildGroup(cases, indices, 'manual', 'locked', true, id);
    if (group) groups.push(group);
  }

  // ── Auto detection over the remaining cases ─────────────────────────────────────────
  const autoIdx = cases.map((_, i) => i).filter((i) => !isManual[i]);
  if (autoIdx.length >= 2) {
    const parent = new Map<number, number>(autoIdx.map((i) => [i, i]));
    const find = (x: number): number => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      let cursor = x;
      while (parent.get(cursor) !== root) {
        const next = parent.get(cursor)!;
        parent.set(cursor, root);
        cursor = next;
      }
      return root;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (ra < rb) parent.set(rb, ra);
      else parent.set(ra, rb);
    };

    const sourceLinked = new Set<number>();
    const noteLinked = new Set<number>();
    const runLinked = new Set<number>();

    // T1 source: same deliverySourceGroupKey.
    if (config.useSourceKey) {
      const byKey = new Map<string, number[]>();
      for (const i of autoIdx) {
        const key = cases[i]!.deliverySourceGroupKey?.trim();
        if (!key) continue;
        const arr = byKey.get(key);
        if (arr) arr.push(i);
        else byKey.set(key, [i]);
      }
      for (const indices of byKey.values()) {
        if (indices.length < 2) continue;
        for (let k = 1; k < indices.length; k++) {
          union(indices[0]!, indices[k]!);
          sourceLinked.add(indices[0]!).add(indices[k]!);
        }
      }
    }

    // T2 note: same deliveryNoteNo.
    if (config.useDeliveryNote) {
      const byNote = new Map<string, number[]>();
      for (const i of autoIdx) {
        const note = cases[i]!.deliveryNoteNo?.trim();
        if (!note) continue;
        const arr = byNote.get(note);
        if (arr) arr.push(i);
        else byNote.set(note, [i]);
      }
      for (const indices of byNote.values()) {
        if (indices.length < 2) continue;
        for (let k = 1; k < indices.length; k++) {
          union(indices[0]!, indices[k]!);
          noteLinked.add(indices[0]!).add(indices[k]!);
        }
      }
    }

    // T3 run: consecutive weBelegNo within the gap, hardened by day/section.
    if (config.useBelegRun) {
      const parsed = autoIdx
        .map((i) => ({ i, num: parseWeBelegNo(cases[i]!.weBelegNo) }))
        .filter((x): x is { i: number; num: number } => x.num !== null)
        .sort((a, b) => a.num - b.num || a.i - b.i);
      for (let k = 1; k < parsed.length; k++) {
        const prev = parsed[k - 1]!;
        const cur = parsed[k]!;
        if (cur.num - prev.num > config.maxWeBelegGap) continue;
        const pc = cases[prev.i]!;
        const cc = cases[cur.i]!;
        if (config.runRequiresSameDay && (pc.bookingDate ?? null) !== (cc.bookingDate ?? null)) {
          continue;
        }
        if (config.runRequiresSameSection && (pc.section ?? null) !== (cc.section ?? null)) {
          continue;
        }
        union(prev.i, cur.i);
        runLinked.add(prev.i).add(cur.i);
      }
    }

    // Materialise components.
    const membersByRoot = new Map<number, number[]>();
    for (const i of autoIdx) {
      const root = find(i);
      const arr = membersByRoot.get(root);
      if (arr) arr.push(i);
      else membersByRoot.set(root, [i]);
    }
    for (const indices of membersByRoot.values()) {
      const hasSource = indices.some((i) => sourceLinked.has(i));
      const hasNote = indices.some((i) => noteLinked.has(i));
      const hasRun = indices.some((i) => runLinked.has(i));
      const tierCount = Number(hasSource) + Number(hasNote) + Number(hasRun);
      const confidence: DeliveryGroupConfidence = hasSource
        ? 'confirmed'
        : hasNote
          ? 'likely'
          : 'suspected';
      const signal: DeliveryGroupSignal =
        tierCount > 1 ? 'mixed' : hasSource ? 'source' : hasNote ? 'note' : 'run';
      const group = buildGroup(cases, indices, signal, confidence, false);
      if (group) groups.push(group);
    }
  }

  groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return groups;
}

/** Build the caseId→groupId / groupId→size / groupId→group lookups from detected groups. */
export function indexDeliveryGroups(groups: readonly DeliveryGroup[]): DeliveryGroupIndex {
  const groupIdByCaseId = new Map<Id, string>();
  const sizeByGroupId = new Map<string, number>();
  const groupById = new Map<string, DeliveryGroup>();
  for (const group of groups) {
    sizeByGroupId.set(group.id, group.caseIds.length);
    groupById.set(group.id, group);
    for (const caseId of group.caseIds) groupIdByCaseId.set(caseId, group.id);
  }
  return { groupIdByCaseId, sizeByGroupId, groupById };
}

/**
 * Case ids the engine must WITHHOLD from auto-distribution: members of suspected (T3-only)
 * groups when `autoDistributeSuspected` is off. They wait in the pool for a Teamlead confirm.
 */
export function withheldCaseIds(
  groups: readonly DeliveryGroup[],
  config: GroupingConfig,
): Set<Id> {
  const withheld = new Set<Id>();
  if (config.autoDistributeSuspected) return withheld;
  for (const group of groups) {
    if (group.confidence === 'suspected') {
      for (const caseId of group.caseIds) withheld.add(caseId);
    }
  }
  return withheld;
}
