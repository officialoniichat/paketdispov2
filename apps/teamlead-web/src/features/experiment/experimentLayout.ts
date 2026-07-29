/**
 * Experiment DA.M.B — reines Layout-Modell des 3-Fenster-Workspace.
 *
 * Der Workspace rendert IMMER dieselben drei Fenster (Belege, Ablagen, Matrix)
 * als stabile Geschwister — dieses Modul rechnet nur ihre absoluten
 * Prozent-Rechtecke und die ziehbaren Splitter-Segmente aus. Drei Anordnungen,
 * unterschieden nach der Lage der Matrix:
 *
 *   'full'  — Matrix unten über die volle Breite, oben Belege | Ablagen
 *   'right' — Belege volle Höhe links, rechts Ablagen über Matrix
 *   'left'  — Ablagen volle Höhe rechts, links Belege über Matrix
 *
 * Der Umbau passiert per Drag ÜBER den Anschlag hinaus: die Unterkante von
 * Belege/Ablagen ganz nach unten ziehen → das Fenster nimmt die volle Höhe und
 * die Matrix rückt in die andere Spalte; die Matrix-Seitenkante ganz zur
 * Gegenseite ziehen → Matrix wieder über die volle Breite.
 */

export type PaneId = 'belege' | 'ablagen' | 'matrix';
export type MatrixPos = 'full' | 'right' | 'left';

/** Persistierter Layout-Zustand (`paket.view.experiment`). */
export interface ExperimentSplit {
  matrixPos: MatrixPos;
  /** Horizontale Grenze in % (Unterkante des oberen Fensters der geteilten Spalte). */
  topPct: number;
  /** Vertikale Grenze in % (rechte Kante des linken Fensters). */
  leftPct: number;
}

export const DEFAULT_SPLIT: ExperimentSplit = { matrixPos: 'full', topPct: 50, leftPct: 50 };

/** Normale Zieh-Spanne einer Grenze. */
export const MIN_PCT = 20;
export const MAX_PCT = 80;
/** Jenseits davon baut der Drag die Anordnung um, statt weiter zu klemmen. */
export const RESTRUCTURE_HI = 88;
export const RESTRUCTURE_LO = 12;

export function clampPct(value: number): number {
  return Math.min(MAX_PCT, Math.max(MIN_PCT, value));
}

/** Korrupte/alte localStorage-Blobs (auch ohne matrixPos) defensiv normalisieren. */
export function sanitizeSplit(raw: Partial<ExperimentSplit> | null | undefined): ExperimentSplit {
  return {
    matrixPos: raw?.matrixPos === 'right' || raw?.matrixPos === 'left' ? raw.matrixPos : 'full',
    topPct:
      typeof raw?.topPct === 'number' && Number.isFinite(raw.topPct)
        ? clampPct(raw.topPct)
        : DEFAULT_SPLIT.topPct,
    leftPct:
      typeof raw?.leftPct === 'number' && Number.isFinite(raw.leftPct)
        ? clampPct(raw.leftPct)
        : DEFAULT_SPLIT.leftPct,
  };
}

/** Absolutes Fenster-Rechteck in Prozent der Workspace-Fläche. */
export interface PaneRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function paneRects(s: ExperimentSplit): Record<PaneId, PaneRect> {
  const { matrixPos, topPct, leftPct } = s;
  if (matrixPos === 'right') {
    return {
      belege: { top: 0, left: 0, width: leftPct, height: 100 },
      ablagen: { top: 0, left: leftPct, width: 100 - leftPct, height: topPct },
      matrix: { top: topPct, left: leftPct, width: 100 - leftPct, height: 100 - topPct },
    };
  }
  if (matrixPos === 'left') {
    return {
      belege: { top: 0, left: 0, width: leftPct, height: topPct },
      matrix: { top: topPct, left: 0, width: leftPct, height: 100 - topPct },
      ablagen: { top: 0, left: leftPct, width: 100 - leftPct, height: 100 },
    };
  }
  return {
    belege: { top: 0, left: 0, width: leftPct, height: topPct },
    ablagen: { top: 0, left: leftPct, width: 100 - leftPct, height: topPct },
    matrix: { top: topPct, left: 0, width: 100, height: 100 - topPct },
  };
}

/** Ein ziehbares Splitter-Segment: absolute Lage in %, Achse + Umbau-Hinweis. */
export interface SplitterSeg {
  id: 'h-left' | 'h-right' | 'v-upper' | 'v-lower';
  /** 'y': horizontale Grenzlinie (row-resize), 'x': vertikale (col-resize). */
  axis: 'x' | 'y';
  /** Lage der Grenze in % (bei 'y' der top-, bei 'x' der left-Wert). */
  at: number;
  /** Erstreckung entlang der Grenze in % (from..to). */
  from: number;
  to: number;
  label: string;
  /** Tooltip für die Umbau-Geste (nur Segmente, die die Anordnung wechseln können). */
  hint?: string;
}

export function splitterSegs(s: ExperimentSplit): SplitterSeg[] {
  const { matrixPos, topPct, leftPct } = s;
  if (matrixPos === 'right') {
    return [
      {
        id: 'v-upper',
        axis: 'x',
        at: leftPct,
        from: 0,
        to: topPct,
        label: 'Fensterbreite anpassen (Belege / Ablagen)',
      },
      {
        id: 'v-lower',
        axis: 'x',
        at: leftPct,
        from: topPct,
        to: 100,
        label: 'Fensterbreite anpassen (Belege / Matrix)',
        hint: 'Ganz nach links ziehen: Matrix wieder über die volle Breite',
      },
      {
        id: 'h-right',
        axis: 'y',
        at: topPct,
        from: leftPct,
        to: 100,
        label: 'Fensterhöhe anpassen (Ablagen / Matrix)',
      },
    ];
  }
  if (matrixPos === 'left') {
    return [
      {
        id: 'v-upper',
        axis: 'x',
        at: leftPct,
        from: 0,
        to: topPct,
        label: 'Fensterbreite anpassen (Belege / Ablagen)',
      },
      {
        id: 'v-lower',
        axis: 'x',
        at: leftPct,
        from: topPct,
        to: 100,
        label: 'Fensterbreite anpassen (Matrix / Ablagen)',
        hint: 'Ganz nach rechts ziehen: Matrix wieder über die volle Breite',
      },
      {
        id: 'h-left',
        axis: 'y',
        at: topPct,
        from: 0,
        to: leftPct,
        label: 'Fensterhöhe anpassen (Belege / Matrix)',
      },
    ];
  }
  return [
    {
      id: 'v-upper',
      axis: 'x',
      at: leftPct,
      from: 0,
      to: topPct,
      label: 'Fensterbreite anpassen (Belege / Ablagen)',
    },
    {
      id: 'h-left',
      axis: 'y',
      at: topPct,
      from: 0,
      to: leftPct,
      label: 'Fensterhöhe anpassen (Belege / Matrix)',
      hint: 'Ganz nach unten ziehen: Belege volle Höhe, Matrix rückt nach rechts',
    },
    {
      id: 'h-right',
      axis: 'y',
      at: topPct,
      from: leftPct,
      to: 100,
      label: 'Fensterhöhe anpassen (Ablagen / Matrix)',
      hint: 'Ganz nach unten ziehen: Ablagen volle Höhe, Matrix rückt nach links',
    },
  ];
}

/**
 * Wendet einen Splitter-Drag an. `raw` ist die UNgeklemmte Pointer-Position in
 * % entlang der Zieh-Achse; `start` der Split beim pointerdown — beim Umbau
 * werden die übrigen Grenzen daraus wiederhergestellt (das expandierende
 * Fenster gewinnt, die anderen behalten ihre vorherige Aufteilung).
 */
export function applySegDrag(
  s: ExperimentSplit,
  seg: SplitterSeg['id'],
  raw: number,
  start: ExperimentSplit,
): ExperimentSplit {
  if (s.matrixPos === 'full') {
    if (seg === 'h-left') {
      if (raw >= RESTRUCTURE_HI)
        return { matrixPos: 'right', topPct: start.topPct, leftPct: start.leftPct };
      return { ...s, topPct: clampPct(raw) };
    }
    if (seg === 'h-right') {
      if (raw >= RESTRUCTURE_HI)
        return { matrixPos: 'left', topPct: start.topPct, leftPct: start.leftPct };
      return { ...s, topPct: clampPct(raw) };
    }
    return { ...s, leftPct: clampPct(raw) };
  }
  if (seg === 'v-lower') {
    if (s.matrixPos === 'right' && raw <= RESTRUCTURE_LO)
      return { matrixPos: 'full', topPct: start.topPct, leftPct: start.leftPct };
    if (s.matrixPos === 'left' && raw >= RESTRUCTURE_HI)
      return { matrixPos: 'full', topPct: start.topPct, leftPct: start.leftPct };
    return { ...s, leftPct: clampPct(raw) };
  }
  if (seg === 'v-upper') return { ...s, leftPct: clampPct(raw) };
  // 'h-left' (matrixPos 'left') bzw. 'h-right' ('right'): Grenze in der Matrix-Spalte.
  return { ...s, topPct: clampPct(raw) };
}
