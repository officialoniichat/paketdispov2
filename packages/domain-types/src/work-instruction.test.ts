import { describe, expect, it } from 'vitest';
import {
  receiptPositionSchema,
  workInstructionHeaderSchema,
  type PositionInstruction,
  type ReceiptPosition,
  type WorkInstructionHeader,
} from './cases.js';
import { deriveWorkInstructionPoints, workInstructionPointSchema } from './work-instruction.js';

const header = (over: Partial<WorkInstructionHeader> = {}): WorkInstructionHeader =>
  workInstructionHeaderSchema.parse({
    caseId: 'c1',
    priceLabelPrintRequired: true,
    sortByArticleColorSizeRequired: true,
    goodsReceiptCheckMode: 'quantity_only',
    minimumQuantityCheckAlwaysRequired: true,
    boxLabelRequired: true,
    zstRequired: true,
    ...over,
  });

const instr = (over: Partial<PositionInstruction> = {}): PositionInstruction => ({
  priceLabelRequired: true,
  priceLabelAttachRequired: true,
  securityRequired: false,
  onlineHandlingRequired: false,
  ...over,
});

const pos = (positionNo: number, instruction: PositionInstruction): ReceiptPosition =>
  receiptPositionSchema.parse({
    id: `p${positionNo}`,
    caseId: 'c1',
    positionNo,
    wgr: '218110',
    supplierArticleNo: `ART-${positionNo}`,
    supplierColor: 'black',
    branchNo: '1',
    shopNo: '2143',
    instruction,
    skuLines: [],
    status: 'open',
  });

const examplePositions = [1, 2, 3, 4, 5].map((n) => pos(n, instr()));

function byKey(points: ReturnType<typeof deriveWorkInstructionPoints>, key: string) {
  return points.find((p) => p.key === key);
}

describe('deriveWorkInstructionPoints — example Beleg (1,5,6,8,9,10,11)', () => {
  const points = deriveWorkInstructionPoints(header(), examplePositions);

  it('emits the confirmed points with their printed numbers', () => {
    expect(byKey(points, 'price_label_print')).toMatchObject({ pointNo: 1, value: 'Ja' });
    expect(byKey(points, 'sort')).toMatchObject({ pointNo: 5, value: 'Ja' });
    expect(byKey(points, 'box_label')).toMatchObject({ pointNo: 9, value: 'Ja' });
    expect(byKey(points, 'zst')).toMatchObject({ pointNo: 11, value: 'Ja' });
  });

  it('does NOT emit a Warenbezeichnung point (point 4 is the position list, not a derived line)', () => {
    expect(byKey(points, 'warenbezeichnung')).toBeUndefined();
    expect(points.some((p) => p.pointNo === 4)).toBe(false);
  });

  it('shows "Nein" for Prüfung Wareneingang when quantity_only', () => {
    expect(byKey(points, 'goods_receipt_check')).toMatchObject({ pointNo: 6, value: 'Nein' });
  });

  it('lists the positions for "Preisetiketten anbringen" (point 8)', () => {
    expect(byKey(points, 'price_label_attach')).toMatchObject({
      pointNo: 8,
      scope: 'position',
      positionNos: [1, 2, 3, 4, 5],
    });
  });

  it('phrases security negatively when no position needs securing (point 10)', () => {
    const sec = byKey(points, 'security');
    expect(sec?.pointNo).toBe(10);
    expect(sec?.value).toContain('Nicht sichern');
  });

  it('does NOT emit variant points (Rotpreis/Online) for the plain example', () => {
    expect(byKey(points, 'red_price')).toBeUndefined();
    expect(byKey(points, 'online_handling')).toBeUndefined();
  });

  it('is ordered by printed point number', () => {
    const numbered = points.filter((p) => p.pointNo !== undefined).map((p) => p.pointNo);
    expect(numbered).toEqual([...numbered].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('every emitted point validates against the schema', () => {
    for (const p of points) expect(() => workInstructionPointSchema.parse(p)).not.toThrow();
  });
});

describe('deriveWorkInstructionPoints — variants', () => {
  it('shows the percentage for Prüfung = Stichprobe', () => {
    const points = deriveWorkInstructionPoints(
      header({ goodsReceiptCheckMode: 'percentage_check', goodsReceiptCheckPercentage: 20 }),
      examplePositions,
    );
    expect(byKey(points, 'goods_receipt_check')?.value).toBe('20 %');
  });

  it('phrases security positively and lists the positions when some need securing', () => {
    const positions = [pos(1, instr({ securityRequired: true })), pos(2, instr())];
    const sec = byKey(deriveWorkInstructionPoints(header(), positions), 'security');
    expect(sec?.value).toContain('Sichern');
    expect(sec?.positionNos).toEqual([1]);
  });

  it('emits a Rotpreis point (no fabricated number) when a position requires it', () => {
    const positions = [pos(1, instr({ redPriceRequired: true })), pos(2, instr())];
    const rp = byKey(deriveWorkInstructionPoints(header(), positions), 'red_price');
    expect(rp).toBeDefined();
    expect(rp?.pointNo).toBeUndefined();
    expect(rp?.positionNos).toEqual([1]);
  });

  it('emits an Online-Handling point when a position requires it', () => {
    const positions = [pos(1, instr({ onlineHandlingRequired: true }))];
    expect(byKey(deriveWorkInstructionPoints(header(), positions), 'online_handling')).toBeDefined();
  });
});
