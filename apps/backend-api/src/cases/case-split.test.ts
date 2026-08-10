import { describe, expect, it } from 'vitest';
import { allocateParts, SplitNotPossibleError, type SplitSourcePosition } from './case-split.js';

/** Position mit `count` Größenzeilen zu je `each` Stück. */
function position(positionNo: number, count: number, each: number): SplitSourcePosition {
  return {
    id: `pos-${positionNo}`,
    positionNo,
    skuLines: Array.from({ length: count }, (_, i) => ({
      id: `sku-${positionNo}-${i}`,
      ean: `40000000000${positionNo}${i}`,
      size: `${36 + i}`,
      expectedQuantity: each,
      ekPrice: null,
      vkPrice: null,
      vkLabelPrice: null,
    })),
  };
}

function totalOf(positions: readonly SplitSourcePosition[]): number {
  return positions.reduce(
    (sum, p) => sum + p.skuLines.reduce((s, l) => s + l.expectedQuantity, 0),
    0,
  );
}

describe('allocateParts', () => {
  it('verteilt eine glatte Menge gleichmäßig auf zwei Teile', () => {
    const positions = [position(1, 5, 10), position(2, 5, 10)]; // 100 Stück
    const parts = allocateParts(positions, [50, 50]);

    expect(parts.map((p) => p.quantity)).toEqual([50, 50]);
    expect(parts[0]!.positions.map((p) => p.source.positionNo)).toEqual([1]);
    expect(parts[1]!.positions.map((p) => p.source.positionNo)).toEqual([2]);
  });

  it('verliert keine Ware — die Summe der Teile ist immer die Gesamtmenge', () => {
    const positions = [position(1, 3, 7), position(2, 4, 9), position(3, 2, 11)];
    const parts = allocateParts(positions, [20, 20, 19]);

    const distributed = parts.reduce((sum, p) => sum + p.quantity, 0);
    expect(distributed).toBe(totalOf(positions));
  });

  it('zerreißt keine Größenzeile: jede Zeile landet ganz in genau einem Teil', () => {
    const positions = [position(1, 4, 25)]; // 4 Zeilen à 25
    const parts = allocateParts(positions, [30, 70]);

    const ids = parts.flatMap((p) => p.positions.flatMap((ap) => ap.skuLines.map((l) => l.id)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(4);
    // 30 ist mit 25er-Schritten nicht exakt treffbar — der erste Teil überschreitet.
    expect(parts[0]!.quantity).toBe(50);
    expect(parts[1]!.quantity).toBe(50);
  });

  it('lässt eine Position an der Teil-Grenze aufgehen, statt eine Größe zu teilen', () => {
    const positions = [position(1, 4, 10)]; // eine Position, 4 Zeilen à 10
    const parts = allocateParts(positions, [20, 20]);

    expect(parts[0]!.positions).toHaveLength(1);
    expect(parts[1]!.positions).toHaveLength(1);
    expect(parts[0]!.positions[0]!.source.positionNo).toBe(1);
    expect(parts[1]!.positions[0]!.source.positionNo).toBe(1);
    expect(parts[0]!.quantity).toBe(20);
    expect(parts[1]!.quantity).toBe(20);
  });

  it('lässt keinen Teil leer, auch wenn die erste Zeile alle Ziele auf einmal reißt', () => {
    const positions: SplitSourcePosition[] = [
      {
        id: 'pos-1',
        positionNo: 1,
        skuLines: [
          { id: 'a', ean: '1', size: '36', expectedQuantity: 900, ekPrice: null, vkPrice: null, vkLabelPrice: null },
          { id: 'b', ean: '2', size: '38', expectedQuantity: 1, ekPrice: null, vkPrice: null, vkLabelPrice: null },
          { id: 'c', ean: '3', size: '40', expectedQuantity: 1, ekPrice: null, vkPrice: null, vkLabelPrice: null },
        ],
      },
    ];
    const parts = allocateParts(positions, [300, 300, 302]);

    expect(parts.every((p) => p.quantity > 0)).toBe(true);
    expect(parts.map((p) => p.quantity)).toEqual([900, 1, 1]);
  });

  it('teilt einen Monster-Beleg in drei schichttaugliche Teile', () => {
    // 2.400 Teile über 12 Positionen à 8 Größenzeilen à 25 Stück.
    const positions = Array.from({ length: 12 }, (_, i) => position(i + 1, 8, 25));
    expect(totalOf(positions)).toBe(2400);

    const parts = allocateParts(positions, [800, 800, 800]);
    expect(parts.map((p) => p.quantity)).toEqual([800, 800, 800]);
    // Jeder Teil liegt unter der Monster-Schwelle (2000) und ist damit wieder
    // regulär auto-verteilbar — genau der Zweck der Aufteilung.
    expect(parts.every((p) => p.quantity < 2000)).toBe(true);
  });

  it('lehnt weniger als zwei Teile ab', () => {
    expect(() => allocateParts([position(1, 2, 5)], [10])).toThrow(SplitNotPossibleError);
  });

  it('lehnt Mengen ab, die nicht positiv oder nicht ganzzahlig sind', () => {
    expect(() => allocateParts([position(1, 2, 5)], [5, 0])).toThrow(SplitNotPossibleError);
    expect(() => allocateParts([position(1, 2, 5)], [5, 2.5])).toThrow(SplitNotPossibleError);
  });

  it('lehnt mehr Teile ab, als es Größenzeilen gibt', () => {
    expect(() => allocateParts([position(1, 2, 5)], [3, 3, 4])).toThrow(/nur 2 Größenzeilen/);
  });
});
