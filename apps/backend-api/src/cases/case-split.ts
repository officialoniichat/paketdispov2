/**
 * Beleg-Aufteilung: welche Ware landet in welchem Teil-Beleg.
 *
 * Reine, deterministische Fachlogik ohne Prisma — die einzige Stelle, an der die
 * Mengenverteilung entschieden wird. Der Service ruft sie und schreibt nur das
 * Ergebnis; die Oberflächen rechnen gar nichts.
 *
 * Zwei Regeln bestimmen alles:
 *
 *  1. **Eine Größenzeile bleibt ganz.** Die SKU-Zeile (EAN + Größe) ist die kleinste
 *     zählbare Einheit im Lager — 12 Stück einer Größe lassen sich nicht sinnvoll auf
 *     zwei Personen aufteilen, ohne dass beide dieselbe Kiste anfassen. Sie ist deshalb
 *     unteilbar, auch wenn dadurch die Zielmenge nicht exakt getroffen wird.
 *  2. **Positionen bleiben beieinander.** Die Zeilen werden in Positions-/Größenordnung
 *     durchlaufen, sodass ein Teil-Beleg zusammenhängende Positionen bekommt statt
 *     quer verstreuter Reste. Eine Position darf an der Grenze zwischen zwei Teilen
 *     aufgehen — dann steht sie in beiden Teil-Belegen mit ihren jeweiligen Größen.
 *
 * Die Mengen aus dem Dialog sind damit ZIELE, keine Zusagen: das Ergebnis meldet die
 * tatsächlich verteilten Mengen zurück, und die Summe über alle Teile ist immer die
 * Gesamtmenge des Belegs — es geht nichts verloren.
 */

/** Eine Größenzeile des Quell-Belegs (EAN + Größe = kleinste unteilbare Einheit). */
export interface SplitSourceSkuLine {
  id: string;
  ean: string;
  size: string;
  expectedQuantity: number;
  ekPrice: number | null;
  vkPrice: number | null;
  vkLabelPrice: number | null;
}

/** Eine Position des Quell-Belegs mit ihren Größenzeilen. */
export interface SplitSourcePosition {
  id: string;
  positionNo: number;
  skuLines: SplitSourceSkuLine[];
}

/** Der Anteil EINER Position an EINEM Teil-Beleg. */
export interface AllocatedPosition<P extends SplitSourcePosition = SplitSourcePosition> {
  source: P;
  skuLines: SplitSourceSkuLine[];
  quantity: number;
}

/** Was ein Teil-Beleg bekommt. */
export interface PartAllocation<P extends SplitSourcePosition = SplitSourcePosition> {
  /** Vom Teamlead gewünschte Menge. */
  targetQuantity: number;
  /** Tatsächlich zugeteilte Menge (Summe der ganzen Größenzeilen). */
  quantity: number;
  positions: AllocatedPosition<P>[];
}

/** Warum eine Aufteilung nicht durchführbar ist (Klartext für den Dialog). */
export class SplitNotPossibleError extends Error {}

/**
 * Verteile die Größenzeilen der Positionen auf `targets` Teil-Belege.
 *
 * Greedy in Positions-/Größenordnung: der aktuelle Teil sammelt Zeilen, bis seine
 * Zielmenge erreicht ist, dann rückt der Zeiger weiter. Zusätzlich rückt er vor, sobald
 * nur noch so viele Zeilen übrig sind, wie Teile zu füllen sind — so bleibt garantiert
 * kein Teil-Beleg leer (ein leerer Teil wäre ein Beleg ohne Ware).
 */
export function allocateParts<P extends SplitSourcePosition>(
  positions: readonly P[],
  targets: readonly number[],
): PartAllocation<P>[] {
  if (targets.length < 2) {
    throw new SplitNotPossibleError('Eine Aufteilung braucht mindestens zwei Teile.');
  }
  if (targets.some((t) => !Number.isInteger(t) || t <= 0)) {
    throw new SplitNotPossibleError('Jeder Teil braucht eine Menge größer als null.');
  }

  // Positions-/Größenordnung ist die Reihenfolge, in der die Ware im Regal steht.
  const ordered = [...positions].sort((a, b) => a.positionNo - b.positionNo);
  const lines = ordered.flatMap((position) =>
    [...position.skuLines]
      .sort((a, b) => a.ean.localeCompare(b.ean) || a.size.localeCompare(b.size))
      .map((line) => ({ position, line })),
  );

  if (lines.length < targets.length) {
    throw new SplitNotPossibleError(
      `Der Beleg hat nur ${lines.length} Größenzeilen — auf ${targets.length} Teile lässt er sich ` +
        'nicht aufteilen, ohne eine Größe zu zerreißen.',
    );
  }

  const parts: PartAllocation<P>[] = targets.map((targetQuantity) => ({
    targetQuantity,
    quantity: 0,
    positions: [],
  }));

  let index = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const entry = lines[i]!;
    const part = parts[index]!;

    // Zeile ganz in den aktuellen Teil; innerhalb des Teils nach Position gruppiert.
    const last = part.positions[part.positions.length - 1];
    if (last && last.source.id === entry.position.id) {
      last.skuLines.push(entry.line);
      last.quantity += entry.line.expectedQuantity;
    } else {
      part.positions.push({
        source: entry.position,
        skuLines: [entry.line],
        quantity: entry.line.expectedQuantity,
      });
    }
    part.quantity += entry.line.expectedQuantity;

    const linesLeft = lines.length - i - 1;
    const partsLeftToFill = parts.length - index - 1;
    const reachedTarget = part.quantity >= part.targetQuantity;
    // Vorrücken, sobald das Ziel steht — oder spätestens, wenn jede verbleibende Zeile
    // für einen eigenen Teil gebraucht wird.
    if (partsLeftToFill > 0 && (reachedTarget || linesLeft <= partsLeftToFill)) {
      index += 1;
    }
  }

  return parts;
}
