import { describe, expect, it } from 'vitest';
import {
  computeBoxTargets,
  splitBoxCount,
  toBoxGoodsType,
  type BoxSplitContext,
  type BoxSplitPosition,
} from './box-splitting.js';

function ctx(overrides: Partial<BoxSplitContext> = {}): BoxSplitContext {
  return {
    caseId: 'case-1',
    branchNo: '027',
    defaultShopAreaNo: 'SB-1',
    defaultFloor: 'EG',
    goodsTypeText: 'Vororder',
    boxLabelRequired: true,
    ...overrides,
  };
}

describe('computeBoxTargets – splitting by Shopbereich/Shop/Etage (Anhang D)', () => {
  it('puts positions sharing shop area/shop/floor into one box', () => {
    const positions: BoxSplitPosition[] = [
      { positionId: 'p1', shopNo: '10', floor: 'EG', quantity: 4 },
      { positionId: 'p2', shopNo: '10', floor: 'EG', quantity: 6 },
    ];
    const boxes = computeBoxTargets(ctx(), positions);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].positionIds).toEqual(['p1', 'p2']);
    expect(boxes[0].plannedQuantity).toBe(10);
    expect(boxes[0].boxNo).toBe(1);
  });

  it('splits a case spanning two shops into two separately-numbered boxes', () => {
    const positions: BoxSplitPosition[] = [
      { positionId: 'p1', shopNo: '20', floor: 'OG', quantity: 3 },
      { positionId: 'p2', shopNo: '10', floor: 'EG', quantity: 5 },
    ];
    const boxes = computeBoxTargets(ctx(), positions);
    expect(boxes).toHaveLength(2);
    // deterministic ordering: shop 10/EG sorts before shop 20/OG
    expect(boxes.map((b) => b.boxNo)).toEqual([1, 2]);
    expect(boxes[0].shopNo).toBe('10');
    expect(boxes[1].shopNo).toBe('20');
  });

  it('splits by floor even within the same shop', () => {
    const positions: BoxSplitPosition[] = [
      { positionId: 'p1', shopNo: '10', floor: 'EG', quantity: 2 },
      { positionId: 'p2', shopNo: '10', floor: '1OG', quantity: 2 },
    ];
    expect(computeBoxTargets(ctx(), positions)).toHaveLength(2);
  });

  it('falls back to the case default shop area and floor', () => {
    const boxes = computeBoxTargets(ctx({ defaultShopAreaNo: 'SB-9', defaultFloor: 'KG' }), [
      { positionId: 'p1', shopNo: '10', quantity: 1 },
    ]);
    expect(boxes[0].shopAreaNo).toBe('SB-9');
    expect(boxes[0].floor).toBe('KG');
  });

  it('honours a per-position shop-area override', () => {
    const boxes = computeBoxTargets(ctx(), [
      { positionId: 'p1', shopAreaNo: 'SB-2', shopNo: '10', floor: 'EG', quantity: 1 },
      { positionId: 'p2', shopNo: '10', floor: 'EG', quantity: 1 },
    ]);
    expect(boxes).toHaveLength(2);
  });

  it('skips positions with zero planned quantity', () => {
    const boxes = computeBoxTargets(ctx(), [
      { positionId: 'p1', shopNo: '10', floor: 'EG', quantity: 0 },
      { positionId: 'p2', shopNo: '10', floor: 'EG', quantity: 3 },
    ]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].positionIds).toEqual(['p2']);
  });

  it('is idempotent: re-running yields identical boxNo assignment', () => {
    const positions: BoxSplitPosition[] = [
      { positionId: 'p1', shopNo: '20', floor: 'OG', quantity: 3 },
      { positionId: 'p2', shopNo: '10', floor: 'EG', quantity: 5 },
    ];
    expect(computeBoxTargets(ctx(), positions)).toEqual(computeBoxTargets(ctx(), positions));
  });

  it('sets labelStatus from boxLabelRequired', () => {
    const required = computeBoxTargets(ctx({ boxLabelRequired: true }), [
      { positionId: 'p1', shopNo: '10', quantity: 1 },
    ]);
    const notRequired = computeBoxTargets(ctx({ boxLabelRequired: false }), [
      { positionId: 'p1', shopNo: '10', quantity: 1 },
    ]);
    expect(required[0].labelStatus).toBe('pending');
    expect(notRequired[0].labelStatus).toBe('not_required');
  });
});

describe('toBoxGoodsType', () => {
  it('maps document goods-type text to the box routing type', () => {
    expect(toBoxGoodsType('Vororder')).toBe('vororder');
    expect(toBoxGoodsType('NOS-Nachorder')).toBe('nos_nachorder');
    expect(toBoxGoodsType('Sonderposten')).toBe('sopo');
    expect(toBoxGoodsType(undefined)).toBe('mixed');
  });
});

describe('splitBoxCount', () => {
  it('counts boxes for the effort penalty (§8.2)', () => {
    const boxes = computeBoxTargets(ctx(), [
      { positionId: 'p1', shopNo: '10', quantity: 1 },
      { positionId: 'p2', shopNo: '20', quantity: 1 },
      { positionId: 'p3', shopNo: '30', quantity: 1 },
    ]);
    expect(splitBoxCount(boxes)).toBe(3);
  });
});
