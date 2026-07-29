import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPLIT,
  applySegDrag,
  paneRects,
  sanitizeSplit,
  splitterSegs,
  type ExperimentSplit,
} from './experimentLayout.js';

const FULL: ExperimentSplit = { matrixPos: 'full', topPct: 50, leftPct: 40 };

describe('experimentLayout', () => {
  it('sanitizeSplit migriert alte Blobs ohne matrixPos und klemmt Werte', () => {
    expect(sanitizeSplit({ topPct: 30.5, leftPct: 44 })).toEqual({
      matrixPos: 'full',
      topPct: 30.5,
      leftPct: 44,
    });
    expect(sanitizeSplit({ matrixPos: 'right', topPct: 990, leftPct: -5 })).toEqual({
      matrixPos: 'right',
      topPct: 80,
      leftPct: 20,
    });
    expect(sanitizeSplit(null)).toEqual(DEFAULT_SPLIT);
    expect(sanitizeSplit({ matrixPos: 'diagonal' as never, topPct: Number.NaN })).toEqual(
      DEFAULT_SPLIT,
    );
  });

  it('paneRects full: Matrix volle Breite unten, oben Belege | Ablagen', () => {
    const r = paneRects(FULL);
    expect(r.belege).toEqual({ top: 0, left: 0, width: 40, height: 50 });
    expect(r.ablagen).toEqual({ top: 0, left: 40, width: 60, height: 50 });
    expect(r.matrix).toEqual({ top: 50, left: 0, width: 100, height: 50 });
  });

  it('paneRects right: Belege volle Höhe, Matrix unten rechts', () => {
    const r = paneRects({ matrixPos: 'right', topPct: 50, leftPct: 40 });
    expect(r.belege).toEqual({ top: 0, left: 0, width: 40, height: 100 });
    expect(r.ablagen).toEqual({ top: 0, left: 40, width: 60, height: 50 });
    expect(r.matrix).toEqual({ top: 50, left: 40, width: 60, height: 50 });
  });

  it('paneRects left: Ablagen volle Höhe, Matrix unten links', () => {
    const r = paneRects({ matrixPos: 'left', topPct: 50, leftPct: 40 });
    expect(r.ablagen).toEqual({ top: 0, left: 40, width: 60, height: 100 });
    expect(r.matrix).toEqual({ top: 50, left: 0, width: 40, height: 50 });
    expect(r.belege).toEqual({ top: 0, left: 0, width: 40, height: 50 });
  });

  it('normale Drags verschieben die Grenze geklemmt (20–80) ohne Umbau', () => {
    expect(applySegDrag(FULL, 'h-left', 62, FULL)).toEqual({ ...FULL, topPct: 62 });
    expect(applySegDrag(FULL, 'h-right', 5, FULL).topPct).toBe(20);
    expect(applySegDrag(FULL, 'v-upper', 85, FULL).leftPct).toBe(80);
  });

  it('Belege-Unterkante über den Anschlag → Matrix rückt nach rechts, Rest wie vor dem Drag', () => {
    const dragged = applySegDrag({ ...FULL, topPct: 80 }, 'h-left', 92, FULL);
    expect(dragged).toEqual({ matrixPos: 'right', topPct: 50, leftPct: 40 });
  });

  it('Ablagen-Unterkante über den Anschlag → Matrix rückt nach links', () => {
    expect(applySegDrag(FULL, 'h-right', 95, FULL).matrixPos).toBe('left');
  });

  it('Matrix-Seitenkante zur Gegenseite → Matrix wieder über volle Breite', () => {
    const right: ExperimentSplit = { matrixPos: 'right', topPct: 35, leftPct: 40 };
    expect(applySegDrag(right, 'v-lower', 8, right)).toEqual({
      matrixPos: 'full',
      topPct: 35,
      leftPct: 40,
    });
    const left: ExperimentSplit = { matrixPos: 'left', topPct: 35, leftPct: 40 };
    expect(applySegDrag(left, 'v-lower', 95, left)).toEqual({
      matrixPos: 'full',
      topPct: 35,
      leftPct: 40,
    });
    // Das obere Segment (neben den Ablagen) baut NIE um, auch jenseits der Schwelle.
    expect(applySegDrag(right, 'v-upper', 8, right)).toEqual({ ...right, leftPct: 20 });
  });

  it('splitterSegs: je Anordnung genau die passenden Segmente', () => {
    expect(splitterSegs(FULL).map((s) => s.id).sort()).toEqual(['h-left', 'h-right', 'v-upper']);
    expect(splitterSegs({ ...FULL, matrixPos: 'right' }).map((s) => s.id).sort()).toEqual([
      'h-right',
      'v-lower',
      'v-upper',
    ]);
    expect(splitterSegs({ ...FULL, matrixPos: 'left' }).map((s) => s.id).sort()).toEqual([
      'h-left',
      'v-lower',
      'v-upper',
    ]);
  });
});
