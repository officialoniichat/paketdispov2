import { describe, expect, it } from 'vitest';
import type { LaneCard } from '../../data/types.js';
import {
  DEFAULT_ABLAGEN_FILTER_STATE,
  activeFilterChips,
  cardIsPrio,
  cardMatchesFilter,
  cardNeedsDecision,
  filterLaneCards,
  groupCards,
  isFilterActive,
  removeFilterChip,
} from './ablagenFilters.js';

function makeCard(overrides: Partial<LaneCard> = {}): LaneCard {
  return {
    caseId: 'case-1',
    weBelegNo: 'WE-1000',
    status: 'ready',
    section: 1,
    goodsTypeText: 'NOS',
    priorityFlags: [],
    totalQuantity: 20,
    effortPoints: 5,
    estimatedMinutes: 30,
    storageCode: 'R-1-1',
    assignedTo: undefined,
    issueStatus: undefined,
    openIssue: null,
    forwardedTo: null,
    bereich: 'Regal',
    attentionFlag: false,
    attentionNote: null,
    deliveryGroup: null,
    ...overrides,
  };
}

describe('cardNeedsDecision', () => {
  it('is true for a blocked (zurück an Bucher) case', () => {
    expect(cardNeedsDecision(makeCard({ status: 'blocked' }))).toBe(true);
  });

  it('is true for an open problem', () => {
    expect(cardNeedsDecision(makeCard({ openIssue: { kind: 'Falschlieferung', note: null } }))).toBe(true);
  });

  it('is true for besondere Aufmerksamkeit', () => {
    expect(cardNeedsDecision(makeCard({ attentionFlag: true }))).toBe(true);
  });

  it('is false for a plain ready card', () => {
    expect(cardNeedsDecision(makeCard())).toBe(false);
  });
});

describe('cardIsPrio', () => {
  it('is true for prio/overdue/same_day_required flags', () => {
    expect(cardIsPrio(makeCard({ priorityFlags: ['overdue'] }))).toBe(true);
  });

  it('is false for catman_due alone', () => {
    expect(cardIsPrio(makeCard({ priorityFlags: ['catman_due'] }))).toBe(false);
  });
});

describe('cardMatchesFilter', () => {
  it('matches everything under the default filter', () => {
    expect(cardMatchesFilter(makeCard(), DEFAULT_ABLAGEN_FILTER_STATE)).toBe(true);
  });

  it('onlyFree excludes assigned cards', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, onlyFree: true };
    expect(cardMatchesFilter(makeCard({ assignedTo: 'M. Berger' }), filter)).toBe(false);
    expect(cardMatchesFilter(makeCard({ assignedTo: undefined }), filter)).toBe(true);
  });

  it('bereiche filter requires a matching Bereich', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, bereiche: ['Hängebahn' as const] };
    expect(cardMatchesFilter(makeCard({ bereich: 'Regal' }), filter)).toBe(false);
    expect(cardMatchesFilter(makeCard({ bereich: 'Hängebahn' }), filter)).toBe(true);
    expect(cardMatchesFilter(makeCard({ bereich: null }), filter)).toBe(false);
  });

  it('goodsTypes filter requires a matching Warenart', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, goodsTypes: ['Prio' as const] };
    expect(cardMatchesFilter(makeCard({ goodsTypeText: 'NOS' }), filter)).toBe(false);
    expect(cardMatchesFilter(makeCard({ goodsTypeText: 'Prio' }), filter)).toBe(true);
  });

  it('deliveryGroup only_grouped/only_single partition correctly', () => {
    const grouped = makeCard({
      deliveryGroup: {
        id: 'dg-1',
        signal: 'source',
        confidence: 'confirmed',
        presentSize: 3,
        missingCount: 0,
        locked: false,
        released: false,
      },
    });
    const single = makeCard({ deliveryGroup: null });
    expect(cardMatchesFilter(grouped, { ...DEFAULT_ABLAGEN_FILTER_STATE, deliveryGroup: 'only_grouped' })).toBe(true);
    expect(cardMatchesFilter(single, { ...DEFAULT_ABLAGEN_FILTER_STATE, deliveryGroup: 'only_grouped' })).toBe(false);
    expect(cardMatchesFilter(grouped, { ...DEFAULT_ABLAGEN_FILTER_STATE, deliveryGroup: 'only_single' })).toBe(false);
    expect(cardMatchesFilter(single, { ...DEFAULT_ABLAGEN_FILTER_STATE, deliveryGroup: 'only_single' })).toBe(true);
  });

  it('quantity range filters min and max independently', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, minQuantity: 10, maxQuantity: 30 };
    expect(cardMatchesFilter(makeCard({ totalQuantity: 5 }), filter)).toBe(false);
    expect(cardMatchesFilter(makeCard({ totalQuantity: 20 }), filter)).toBe(true);
    expect(cardMatchesFilter(makeCard({ totalQuantity: 40 }), filter)).toBe(false);
  });

  it('search matches WE-Nr, Bereich or assigned employee, case-insensitively', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, search: 'berger' };
    expect(cardMatchesFilter(makeCard({ assignedTo: 'M. Berger' }), filter)).toBe(true);
    expect(cardMatchesFilter(makeCard({ assignedTo: 'A. Kranz' }), filter)).toBe(false);
  });

  it('combines multiple active filters with AND', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, onlyFree: true, onlyPrio: true };
    const freeButNotPrio = makeCard({ assignedTo: undefined, priorityFlags: [] });
    const prioButAssigned = makeCard({ assignedTo: 'M. Berger', priorityFlags: ['prio'] });
    const freeAndPrio = makeCard({ assignedTo: undefined, priorityFlags: ['prio'] });
    expect(cardMatchesFilter(freeButNotPrio, filter)).toBe(false);
    expect(cardMatchesFilter(prioButAssigned, filter)).toBe(false);
    expect(cardMatchesFilter(freeAndPrio, filter)).toBe(true);
  });
});

describe('filterLaneCards', () => {
  it('returns only the matching cards, preserving order', () => {
    const cards = [
      makeCard({ caseId: 'a', assignedTo: undefined }),
      makeCard({ caseId: 'b', assignedTo: 'M. Berger' }),
      makeCard({ caseId: 'c', assignedTo: undefined }),
    ];
    const result = filterLaneCards(cards, { ...DEFAULT_ABLAGEN_FILTER_STATE, onlyFree: true });
    expect(result.map((c) => c.caseId)).toEqual(['a', 'c']);
  });
});

describe('isFilterActive / activeFilterChips / removeFilterChip', () => {
  it('the default filter is inactive with no chips', () => {
    expect(isFilterActive(DEFAULT_ABLAGEN_FILTER_STATE)).toBe(false);
    expect(activeFilterChips(DEFAULT_ABLAGEN_FILTER_STATE)).toEqual([]);
  });

  it('reports one chip per active dimension', () => {
    const filter = {
      ...DEFAULT_ABLAGEN_FILTER_STATE,
      onlyFree: true,
      bereiche: ['Regal' as const, 'Palette' as const],
    };
    expect(isFilterActive(filter)).toBe(true);
    const chips = activeFilterChips(filter);
    expect(chips.map((c) => c.key)).toEqual(['onlyFree', 'bereich:Regal', 'bereich:Palette']);
  });

  it('removeFilterChip clears exactly the targeted dimension', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, onlyFree: true, onlyPrio: true };
    const next = removeFilterChip(filter, 'onlyFree');
    expect(next.onlyFree).toBe(false);
    expect(next.onlyPrio).toBe(true);
  });

  it('removeFilterChip removes a single Bereich value out of several', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, bereiche: ['Regal' as const, 'Palette' as const] };
    const next = removeFilterChip(filter, 'bereich:Regal');
    expect(next.bereiche).toEqual(['Palette']);
  });
});

describe('groupCards', () => {
  it('groupBy none returns a single ungrouped bucket', () => {
    const cards = [makeCard({ caseId: 'a' }), makeCard({ caseId: 'b' })];
    const groups = groupCards(cards, 'none');
    expect(groups).toEqual([{ key: 'all', label: null, cards }]);
  });

  it('groupBy bereich buckets by Bereich, unknown last-sorted alphabetically', () => {
    const cards = [
      makeCard({ caseId: 'a', bereich: 'Regal' }),
      makeCard({ caseId: 'b', bereich: 'Hängebahn' }),
      makeCard({ caseId: 'c', bereich: 'Regal' }),
      makeCard({ caseId: 'd', bereich: null }),
    ];
    const groups = groupCards(cards, 'bereich');
    expect(groups.map((g) => g.key)).toEqual(['Hängebahn', 'Regal', 'unbekannt']);
    expect(groups.find((g) => g.key === 'Regal')?.cards.map((c) => c.caseId)).toEqual(['a', 'c']);
  });

  it('groupBy assignedTo buckets by employee, unassigned as unbekannt', () => {
    const cards = [
      makeCard({ caseId: 'a', assignedTo: 'M. Berger' }),
      makeCard({ caseId: 'b', assignedTo: undefined }),
    ];
    const groups = groupCards(cards, 'assignedTo');
    expect(groups.map((g) => g.key)).toEqual(['M. Berger', 'unbekannt']);
  });
});
