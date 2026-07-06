/**
 * Digitale Ablagen — Filter/Segmentierung (pure logic, no React/MUI).
 *
 * Implements Modell A from docs/concept/ablage-filter/README.md: a global,
 * additive (AND) filter over the existing status lanes, plus an optional
 * "Gruppieren nach" that only changes the sub-grouping WITHIN a lane, never
 * the lane axis itself (status/Fachlogik stays the lane boundary).
 */
import type { Bereich, CaseStatus, GoodsTypeText, PriorityFlag } from '@paket/domain-types';
import type { LaneCard, LaneId } from '../../data/types.js';

export type AblagenGroupBy = 'none' | 'bereich' | 'assignedTo';
export type DeliveryGroupFilter = 'any' | 'only_grouped' | 'only_single';

export interface AblagenFilterState {
  search: string;
  onlyFree: boolean;
  onlyNeedsDecision: boolean;
  onlyPrio: boolean;
  bereiche: Bereich[];
  goodsTypes: GoodsTypeText[];
  deliveryGroup: DeliveryGroupFilter;
  minQuantity: number | null;
  maxQuantity: number | null;
  groupBy: AblagenGroupBy;
}

export const DEFAULT_ABLAGEN_FILTER_STATE: AblagenFilterState = {
  search: '',
  onlyFree: false,
  onlyNeedsDecision: false,
  onlyPrio: false,
  bereiche: [],
  goodsTypes: [],
  deliveryGroup: 'any',
  minQuantity: null,
  maxQuantity: null,
  groupBy: 'none',
};

/** Statuses that represent an open decision the TL must make (README §5). */
const DECISION_STATUSES: ReadonlySet<CaseStatus> = new Set(['blocked', 'issue_open', 'needs_review']);

/** Priority flags read as "actually urgent" (excludes catman_due/manual_teamlead_priority). */
const URGENT_PRIORITY_FLAGS: ReadonlySet<PriorityFlag> = new Set(['prio', 'overdue', 'same_day_required']);

/** A card "braucht Entscheidung": open problem, Zurück-an-Bucher, or Besondere Aufmerksamkeit. */
export function cardNeedsDecision(card: LaneCard): boolean {
  return DECISION_STATUSES.has(card.status) || card.openIssue !== null || card.attentionFlag;
}

export function cardIsPrio(card: LaneCard): boolean {
  return card.priorityFlags.some((flag) => URGENT_PRIORITY_FLAGS.has(flag));
}

/**
 * These lanes are already low-volume exception/triage queues (§4 Problemfälle,
 * Geparkt, Weitergeleitet) — their whole purpose is that NOTHING in them goes
 * unnoticed. A stray Bereich/Warenart/Teile-Filter silently hiding the one
 * problem case outside the current filter would defeat that purpose, so these
 * lanes ignore every narrowing filter and only respond to search (a "find",
 * not a "narrow" — see docs/concept/ablage-filter/README.md §5).
 */
const FILTER_EXEMPT_LANES: ReadonlySet<LaneId> = new Set(['probleme', 'geparkt', 'weitergeleitet']);

export function isFilterExemptLane(laneId: LaneId): boolean {
  return FILTER_EXEMPT_LANES.has(laneId);
}

function matchesSearch(card: LaneCard, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    card.weBelegNo.toLowerCase().includes(needle) ||
    (card.bereich?.toLowerCase().includes(needle) ?? false) ||
    (card.assignedTo?.toLowerCase().includes(needle) ?? false)
  );
}

export function cardMatchesFilter(card: LaneCard, filter: AblagenFilterState): boolean {
  if (filter.onlyFree && card.assignedTo) return false;
  if (filter.onlyNeedsDecision && !cardNeedsDecision(card)) return false;
  if (filter.onlyPrio && !cardIsPrio(card)) return false;
  if (filter.bereiche.length > 0 && !(card.bereich && filter.bereiche.includes(card.bereich as Bereich))) {
    return false;
  }
  if (
    filter.goodsTypes.length > 0 &&
    !(card.goodsTypeText && filter.goodsTypes.includes(card.goodsTypeText))
  ) {
    return false;
  }
  if (filter.deliveryGroup === 'only_grouped' && card.deliveryGroup === null) return false;
  if (filter.deliveryGroup === 'only_single' && card.deliveryGroup !== null) return false;
  if (filter.minQuantity !== null && card.totalQuantity < filter.minQuantity) return false;
  if (filter.maxQuantity !== null && card.totalQuantity > filter.maxQuantity) return false;
  if (!matchesSearch(card, filter.search)) return false;
  return true;
}

export function filterLaneCards(cards: LaneCard[], filter: AblagenFilterState): LaneCard[] {
  return cards.filter((card) => cardMatchesFilter(card, filter));
}

/**
 * Lane-aware entry point: exempt lanes (see {@link isFilterExemptLane}) only
 * apply `search`; every other lane applies the full filter.
 */
export function filterLaneCardsForLane(
  cards: LaneCard[],
  filter: AblagenFilterState,
  laneId: LaneId,
): LaneCard[] {
  if (isFilterExemptLane(laneId)) {
    return cards.filter((card) => matchesSearch(card, filter.search));
  }
  return filterLaneCards(cards, filter);
}

export function isFilterActive(filter: AblagenFilterState): boolean {
  return (
    filter.search.trim() !== '' ||
    filter.onlyFree ||
    filter.onlyNeedsDecision ||
    filter.onlyPrio ||
    filter.bereiche.length > 0 ||
    filter.goodsTypes.length > 0 ||
    filter.deliveryGroup !== 'any' ||
    filter.minQuantity !== null ||
    filter.maxQuantity !== null
  );
}

export interface ActiveFilterChip {
  key: string;
  label: string;
}

/** Removable chip per active filter dimension, in a stable, predictable order. */
export function activeFilterChips(filter: AblagenFilterState): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filter.onlyFree) chips.push({ key: 'onlyFree', label: 'Frei' });
  if (filter.onlyNeedsDecision) chips.push({ key: 'onlyNeedsDecision', label: 'Braucht Entscheidung' });
  if (filter.onlyPrio) chips.push({ key: 'onlyPrio', label: 'Prio' });
  for (const bereich of filter.bereiche) chips.push({ key: `bereich:${bereich}`, label: `Bereich: ${bereich}` });
  for (const goodsType of filter.goodsTypes) {
    chips.push({ key: `goodsType:${goodsType}`, label: `Warenart: ${goodsType}` });
  }
  if (filter.deliveryGroup === 'only_grouped') {
    chips.push({ key: 'deliveryGroup', label: 'Nur Lieferungs-Gruppen' });
  } else if (filter.deliveryGroup === 'only_single') {
    chips.push({ key: 'deliveryGroup', label: 'Nur Einzel-Belege' });
  }
  if (filter.minQuantity !== null) chips.push({ key: 'minQuantity', label: `≥ ${filter.minQuantity} Teile` });
  if (filter.maxQuantity !== null) chips.push({ key: 'maxQuantity', label: `≤ ${filter.maxQuantity} Teile` });
  if (filter.search.trim()) chips.push({ key: 'search', label: `Suche: „${filter.search.trim()}"` });
  return chips;
}

/** Clear exactly the filter dimension named by `key` (as produced by {@link activeFilterChips}). */
export function removeFilterChip(filter: AblagenFilterState, key: string): AblagenFilterState {
  if (key === 'search') return { ...filter, search: '' };
  if (key === 'onlyFree') return { ...filter, onlyFree: false };
  if (key === 'onlyNeedsDecision') return { ...filter, onlyNeedsDecision: false };
  if (key === 'onlyPrio') return { ...filter, onlyPrio: false };
  if (key === 'deliveryGroup') return { ...filter, deliveryGroup: 'any' };
  if (key === 'minQuantity') return { ...filter, minQuantity: null };
  if (key === 'maxQuantity') return { ...filter, maxQuantity: null };
  if (key.startsWith('bereich:')) {
    const value = key.slice('bereich:'.length);
    return { ...filter, bereiche: filter.bereiche.filter((b) => b !== value) };
  }
  if (key.startsWith('goodsType:')) {
    const value = key.slice('goodsType:'.length);
    return { ...filter, goodsTypes: filter.goodsTypes.filter((g) => g !== value) };
  }
  return filter;
}

export interface CardGroup {
  key: string;
  label: string | null;
  cards: LaneCard[];
}

/** Sub-group cards within a lane; 'none' preserves the existing single-bucket behaviour. */
export function groupCards(cards: LaneCard[], groupBy: AblagenGroupBy): CardGroup[] {
  if (groupBy === 'none') return [{ key: 'all', label: null, cards }];
  const byKey = new Map<string, LaneCard[]>();
  for (const card of cards) {
    const key = groupBy === 'bereich' ? (card.bereich ?? 'unbekannt') : (card.assignedTo ?? 'unbekannt');
    const bucket = byKey.get(key) ?? [];
    bucket.push(card);
    byKey.set(key, bucket);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'de'))
    .map(([key, groupedCards]) => ({ key, label: key, cards: groupedCards }));
}
