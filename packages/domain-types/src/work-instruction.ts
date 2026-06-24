import { z } from 'zod';
import { fileRefSchema } from './documents.js';

/**
 * Structural inputs for {@link deriveWorkInstructionPoints}. Deliberately narrow
 * so both domain objects (`WorkInstructionHeader`/`ReceiptPosition`) and backend
 * Prisma rows are assignable without casts — the function is the single source
 * of the AW projection across layers.
 */
export interface WorkInstructionPointHeaderInput {
  priceLabelPrintRequired: boolean;
  sortByArticleColorSizeRequired: boolean;
  goodsReceiptCheckMode: string;
  goodsReceiptCheckPercentage?: number | null;
  boxLabelRequired: boolean;
  zstRequired: boolean;
}

export interface WorkInstructionPointPositionInput {
  positionNo: number;
  instruction?: {
    priceLabelAttachRequired: boolean;
    securityRequired: boolean;
    onlineHandlingRequired: boolean;
    redPriceRequired?: boolean | null;
  } | null;
}

/**
 * Faithful, ordered projection of the printed Arbeitsanweisung (L&T Wareneingang
 * V28.x), derived from the stored work-instruction header + position
 * instructions. The paper form is a fixed point template; the derived action
 * points are 1, 5, 6, 8, 9, 10, 11 (point 4 "Warenbezeichnung" is the position
 * identity + Beleg-Kopf, not a derived line — see the concept doc).
 * Conditional points (Prüfung %, "Sichern Ja", Rotpreis, Online) appear only
 * when the data is present.
 *
 * `deriveWorkInstructionPoints` is the SINGLE source of this projection: the
 * backend computes it once so every consumer (employee PWA, future views) shows
 * the identical ordered list — engine/data decides, UI displays.
 */

/** Stable point key (drives icons/logic; survives label/number changes). */
export const workInstructionPointKeySchema = z.enum([
  'price_label_print', // 1
  'sort', // 5
  'goods_receipt_check', // 6
  'price_label_attach', // 8
  'box_label', // 9
  'security', // 10
  'zst', // 11
  'red_price', // variant — printed point number not yet confirmed
  'online_handling', // variant — printed point number not yet confirmed
  'other',
]);
export type WorkInstructionPointKey = z.infer<typeof workInstructionPointKeySchema>;

export const workInstructionPointSchema = z.object({
  /** The printed point number, set only for points confirmed on the real form. */
  pointNo: z.number().int().positive().optional(),
  key: workInstructionPointKeySchema,
  /** German heading as printed ("Preisetikettendruck"). */
  label: z.string(),
  /** Printed value ("Ja"/"Nein"/"20 %"/"Für die Position(en): 1, 2, 3"). */
  value: z.string(),
  scope: z.enum(['header', 'position']),
  /** Positions this point applies to (for position-scoped points). */
  positionNos: z.array(z.number().int()).optional(),
  /** Optional placement graphic (e.g. point 8 "wo anbringen"). */
  assetRef: fileRefSchema.optional(),
});
export type WorkInstructionPoint = z.infer<typeof workInstructionPointSchema>;

const jaNein = (value: boolean): string => (value ? 'Ja' : 'Nein');

const listPositions = (positions: readonly WorkInstructionPointPositionInput[]): number[] =>
  [...positions].map((p) => p.positionNo).sort((a, b) => a - b);

const forPositions = (nos: readonly number[]): string =>
  `Für die Position(en): ${nos.join(', ')}`;

/**
 * Derive the ordered Arbeitsanweisung points from the stored header + positions.
 * Confirmed points carry their printed `pointNo` (1,4,5,6,8,9,10,11); variant
 * points (red_price, online_handling) are emitted by key without a fabricated
 * number until a variant Arbeitsanweisung confirms the numbering.
 */
export function deriveWorkInstructionPoints(
  header: WorkInstructionPointHeaderInput,
  positions: readonly WorkInstructionPointPositionInput[],
): WorkInstructionPoint[] {
  const points: WorkInstructionPoint[] = [];
  const allNos = listPositions(positions);

  // 1. Preisetikettendruck
  points.push({
    pointNo: 1,
    key: 'price_label_print',
    label: 'Preisetikettendruck',
    value: jaNein(header.priceLabelPrintRequired),
    scope: 'header',
  });

  // 4. Warenbezeichnung is NOT a derived AW line: on the L&T form it is the
  // per-position article identity (WGR + Artikel + Farbe + Saison) echoed with
  // the Beleg-Kopf attributes (Filiale/Abschnitt/Etage). Those are header/position
  // data, shown by the position list + Beleg-Kopf — not a checklist point. See
  // docs/concept/warenbezeichnung-position-data-model-concept.md.

  // 5. Nach Artikel, Farbe, Größe sortieren
  points.push({
    pointNo: 5,
    key: 'sort',
    label: 'Nach Artikel, Farbe, Größe sortieren',
    value: jaNein(header.sortByArticleColorSizeRequired),
    scope: 'header',
  });

  // 6. Prüfung Wareneingang (Nein = quantity_only; Ja = full_check; % = Stichprobe)
  const checkValue =
    header.goodsReceiptCheckMode === 'full_check'
      ? 'Ja'
      : header.goodsReceiptCheckMode === 'percentage_check'
        ? `${header.goodsReceiptCheckPercentage ?? 0} %`
        : 'Nein';
  points.push({
    pointNo: 6,
    key: 'goods_receipt_check',
    label: 'Prüfung Wareneingang',
    value: checkValue,
    scope: 'header',
  });

  // 8. Preisetiketten anbringen (position-scoped; only the positions that need it)
  const attachNos = listPositions(positions.filter((p) => p.instruction?.priceLabelAttachRequired));
  if (attachNos.length > 0) {
    points.push({
      pointNo: 8,
      key: 'price_label_attach',
      label: 'Preisetiketten anbringen',
      value: forPositions(attachNos),
      scope: 'position',
      positionNos: attachNos,
    });
  }

  // 9. Beschriftung Boxzettel
  points.push({
    pointNo: 9,
    key: 'box_label',
    label: 'Beschriftung Boxzettel',
    value: jaNein(header.boxLabelRequired),
    scope: 'header',
  });

  // 10. Sicherungsetikett — printed positively ("Sichern für …") or negatively
  // ("Nicht sichern für …"), mirroring the paper form.
  const secureNos = listPositions(positions.filter((p) => p.instruction?.securityRequired));
  points.push({
    pointNo: 10,
    key: 'security',
    label: 'Sicherungsetikett',
    value:
      secureNos.length > 0
        ? `Sichern für die Position(en): ${secureNos.join(', ')}`
        : `Nicht sichern für die Position(en): ${allNos.join(', ')}`,
    scope: 'position',
    positionNos: secureNos.length > 0 ? secureNos : allNos,
  });

  // 11. ZST stempeln
  points.push({
    pointNo: 11,
    key: 'zst',
    label: 'ZST stempeln',
    value: jaNein(header.zstRequired),
    scope: 'header',
  });

  // Variant points — emitted only when present, no fabricated point number.
  const redNos = listPositions(positions.filter((p) => p.instruction?.redPriceRequired === true));
  if (redNos.length > 0) {
    points.push({
      key: 'red_price',
      label: 'Rotpreis',
      value: forPositions(redNos),
      scope: 'position',
      positionNos: redNos,
    });
  }

  const onlineNos = listPositions(positions.filter((p) => p.instruction?.onlineHandlingRequired));
  if (onlineNos.length > 0) {
    points.push({
      key: 'online_handling',
      label: 'Online-Handling',
      value: forPositions(onlineNos),
      scope: 'position',
      positionNos: onlineNos,
    });
  }

  return points;
}
