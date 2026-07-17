import { describe, expect, it } from 'vitest';
import type { LaneCard } from '../../data/types.js';
import {
  DEFAULT_ABLAGEN_FILTER_STATE,
  activeFilterChips,
  cardIsPrio,
  cardMatchesFilter,
  cardNeedsDecision,
  filterLaneCards,
  filterLaneCardsForLane,
  groupCards,
  isFilterActive,
  isFilterExemptLane,
  removeFilterChip,
  sanitizeAblagenFilterState,
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
    expect(
      cardNeedsDecision(makeCard({ openIssue: { kind: 'manual', reasonLabel: 'beschädigt', note: null } })),
    ).toBe(true);
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
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, onlyPrio: true, goodsTypes: ['NOS' as const] };
    const prioButWrongGoodsType = makeCard({ goodsTypeText: 'Prio', priorityFlags: ['prio'] });
    const goodsTypeButNotPrio = makeCard({ goodsTypeText: 'NOS', priorityFlags: [] });
    const both = makeCard({ goodsTypeText: 'NOS', priorityFlags: ['prio'] });
    expect(cardMatchesFilter(prioButWrongGoodsType, filter)).toBe(false);
    expect(cardMatchesFilter(goodsTypeButNotPrio, filter)).toBe(false);
    expect(cardMatchesFilter(both, filter)).toBe(true);
  });
});

describe('filterLaneCards', () => {
  it('returns only the matching cards, preserving order', () => {
    const cards = [
      makeCard({ caseId: 'a', goodsTypeText: 'NOS' }),
      makeCard({ caseId: 'b', goodsTypeText: 'Prio' }),
      makeCard({ caseId: 'c', goodsTypeText: 'NOS' }),
    ];
    const result = filterLaneCards(cards, { ...DEFAULT_ABLAGEN_FILTER_STATE, goodsTypes: ['NOS'] });
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
      onlyNeedsDecision: true,
      goodsTypes: ['NOS' as const, 'Prio' as const],
    };
    expect(isFilterActive(filter)).toBe(true);
    const chips = activeFilterChips(filter);
    expect(chips.map((c) => c.key)).toEqual(['onlyNeedsDecision', 'goodsType:NOS', 'goodsType:Prio']);
  });

  it('removeFilterChip clears exactly the targeted dimension', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, onlyNeedsDecision: true, onlyPrio: true };
    const next = removeFilterChip(filter, 'onlyNeedsDecision');
    expect(next.onlyNeedsDecision).toBe(false);
    expect(next.onlyPrio).toBe(true);
  });

  it('removeFilterChip removes a single Warenart value out of several', () => {
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, goodsTypes: ['NOS' as const, 'Prio' as const] };
    const next = removeFilterChip(filter, 'goodsType:NOS');
    expect(next.goodsTypes).toEqual(['Prio']);
  });
});

describe('isFilterExemptLane', () => {
  it('exempts probleme, geparkt and weitergeleitet', () => {
    expect(isFilterExemptLane('probleme')).toBe(true);
    expect(isFilterExemptLane('geparkt')).toBe(true);
    expect(isFilterExemptLane('weitergeleitet')).toBe(true);
  });

  it('does not exempt working lanes', () => {
    expect(isFilterExemptLane('prio')).toBe(false);
    expect(isFilterExemptLane('jeden_tag')).toBe(false);
    expect(isFilterExemptLane('verladeplan_heute')).toBe(false);
    expect(isFilterExemptLane('verladeplan_morgen')).toBe(false);
    expect(isFilterExemptLane('sonstige')).toBe(false);
  });
});

describe('filterLaneCardsForLane', () => {
  it('exempt lanes ignore narrowing filters entirely', () => {
    const cards = [
      makeCard({ caseId: 'a', goodsTypeText: 'NOS' }),
      makeCard({ caseId: 'b', goodsTypeText: 'Prio' }),
    ];
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, goodsTypes: ['NOS' as const], onlyPrio: true };
    expect(filterLaneCardsForLane(cards, filter, 'probleme').map((c) => c.caseId)).toEqual(['a', 'b']);
    expect(filterLaneCardsForLane(cards, filter, 'geparkt').map((c) => c.caseId)).toEqual(['a', 'b']);
    expect(filterLaneCardsForLane(cards, filter, 'weitergeleitet').map((c) => c.caseId)).toEqual(['a', 'b']);
  });

  it('exempt lanes still respect search', () => {
    const cards = [makeCard({ caseId: 'a', weBelegNo: 'WE-1000' }), makeCard({ caseId: 'b', weBelegNo: 'WE-2000' })];
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, search: '1000' };
    expect(filterLaneCardsForLane(cards, filter, 'probleme').map((c) => c.caseId)).toEqual(['a']);
  });

  it('working lanes apply the full filter, same as filterLaneCards', () => {
    const cards = [
      makeCard({ caseId: 'a', goodsTypeText: 'NOS' }),
      makeCard({ caseId: 'b', goodsTypeText: 'Prio' }),
    ];
    const filter = { ...DEFAULT_ABLAGEN_FILTER_STATE, goodsTypes: ['NOS' as const] };
    expect(filterLaneCardsForLane(cards, filter, 'prio')).toEqual(filterLaneCards(cards, filter));
  });
});

describe('groupCards', () => {
  it('groupBy none returns a single ungrouped bucket', () => {
    const cards = [makeCard({ caseId: 'a' }), makeCard({ caseId: 'b' })];
    const groups = groupCards(cards, 'none');
    expect(groups).toEqual([{ key: 'all', label: null, cards }]);
  });

  it('groupBy bereich buckets by Bereich, missing Bereich sorts last as "unbekannt"', () => {
    const cards = [
      makeCard({ caseId: 'a', bereich: 'Regal' }),
      makeCard({ caseId: 'b', bereich: 'Hängebahn' }),
      makeCard({ caseId: 'c', bereich: 'Regal' }),
      makeCard({ caseId: 'd', bereich: null }),
    ];
    const groups = groupCards(cards, 'bereich');
    expect(groups.map((g) => g.label)).toEqual(['Hängebahn', 'Regal', 'unbekannt']);
    expect(groups.find((g) => g.label === 'Regal')?.cards.map((c) => c.caseId)).toEqual(['a', 'c']);
    expect(groups.find((g) => g.label === 'unbekannt')?.cards.map((c) => c.caseId)).toEqual(['d']);
  });

  it('the fallback ("unbekannt") bucket always sorts last, even when it would alphabetically sort first', () => {
    const cards = [
      makeCard({ caseId: 'a', bereich: null }),
      makeCard({ caseId: 'b', bereich: 'Hängebahn' }),
    ];
    const groups = groupCards(cards, 'bereich');
    expect(groups.map((g) => g.label)).toEqual(['Hängebahn', 'unbekannt']);
  });
});

describe('sanitizeAblagenFilterState', () => {
  it('returns the default filter for undefined input', () => {
    expect(sanitizeAblagenFilterState(undefined)).toEqual(DEFAULT_ABLAGEN_FILTER_STATE);
  });

  it('falls back groupBy to "none" for a value from a removed option (e.g. old "assignedTo")', () => {
    const stale = { groupBy: 'assignedTo' } as unknown as Partial<typeof DEFAULT_ABLAGEN_FILTER_STATE>;
    expect(sanitizeAblagenFilterState(stale).groupBy).toBe('none');
  });

  it('drops keys of removed filter dimensions (e.g. the old "bereiche" filter)', () => {
    const stale = { bereiche: ['Regal'] } as unknown as Partial<typeof DEFAULT_ABLAGEN_FILTER_STATE>;
    expect(sanitizeAblagenFilterState(stale)).toEqual(DEFAULT_ABLAGEN_FILTER_STATE);
  });

  it('keeps a valid groupBy and merges other persisted fields over the defaults', () => {
    const persisted = { groupBy: 'bereich' as const, onlyPrio: true };
    const result = sanitizeAblagenFilterState(persisted);
    expect(result.groupBy).toBe('bereich');
    expect(result.onlyPrio).toBe(true);
    expect(result.onlyNeedsDecision).toBe(false);
  });
});
