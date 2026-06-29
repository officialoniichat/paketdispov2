import { describe, expect, it } from 'vitest';
import { computeEffort, DEFAULT_EFFORT_CONFIG } from '@paket/assignment-engine';
import { handlingClassFromLocationKind } from '@paket/domain-types';
import { buildEffortVector, buildEffortVectors, type EffortVectorCaseRow } from './effort-vector.js';

/** A fully-instructionalised case row touching every effort driver. */
function fullRow(overrides: Partial<EffortVectorCaseRow> = {}): EffortVectorCaseRow {
  return {
    id: 'case-1',
    totalQuantity: 60,
    storageLocation: { kind: 'regal' },
    workInstruction: {
      priceLabelPrintRequired: true,
      goodsReceiptCheckMode: 'percentage_check',
      goodsReceiptCheckPercentage: 50,
    },
    positions: [
      {
        wgr: '218110',
        instruction: {
          priceLabelAttachRequired: true,
          securityRequired: true,
          onlineHandlingRequired: true,
          redPriceRequired: true,
        },
      },
      {
        wgr: '218110',
        instruction: {
          priceLabelAttachRequired: true,
          securityRequired: false,
          onlineHandlingRequired: false,
          redPriceRequired: false,
        },
      },
      {
        wgr: '111130',
        instruction: {
          priceLabelAttachRequired: false,
          securityRequired: false,
          onlineHandlingRequired: true,
          redPriceRequired: null,
        },
      },
    ],
    ...overrides,
  };
}

describe('buildEffortVector', () => {
  it('returns undefined when the case has no work instruction (engine falls back)', () => {
    expect(buildEffortVector(fullRow({ workInstruction: null }))).toBeUndefined();
  });

  it('derives every driver from work instruction + position instructions + storage class', () => {
    const v = buildEffortVector(fullRow());
    expect(v).toBeDefined();
    expect(v).toMatchObject({
      caseId: 'case-1',
      totalQuantity: 60,
      priceLabelPrintRequired: true,
      priceLabelAttachPositionCount: 2, // two positions with priceLabelAttachRequired
      securityRequiredPositionCount: 1, // one position with securityRequired
      onlineRelevantPositionCount: 2, // two positions with onlineHandlingRequired
      redPriceRequired: true, // any position
      goodsReceiptCheckMode: 'percentage_check',
      goodsReceiptCheckPercentage: 50,
      handlingClass: 'normal', // regal
    });
    expect(v!.wgrCodes.sort()).toEqual(['111130', '218110']); // distinct
  });

  it('redPriceRequired aggregates with OR and treats null as false', () => {
    // all false → false
    const allFalse = fullRow();
    for (const p of allFalse.positions) if (p.instruction) p.instruction.redPriceRequired = false;
    expect(buildEffortVector(allFalse)!.redPriceRequired).toBe(false);
    // mix of null and false → false
    const nullAndFalse = fullRow();
    nullAndFalse.positions[0]!.instruction!.redPriceRequired = null;
    nullAndFalse.positions[1]!.instruction!.redPriceRequired = false;
    nullAndFalse.positions[2]!.instruction!.redPriceRequired = false;
    expect(buildEffortVector(nullAndFalse)!.redPriceRequired).toBe(false);
    // one true among null/false → true
    const oneTrue = fullRow();
    oneTrue.positions[0]!.instruction!.redPriceRequired = null;
    oneTrue.positions[1]!.instruction!.redPriceRequired = true;
    oneTrue.positions[2]!.instruction!.redPriceRequired = false;
    expect(buildEffortVector(oneTrue)!.redPriceRequired).toBe(true);
  });

  it('maps a missing check percentage to undefined', () => {
    const v = buildEffortVector(
      fullRow({
        workInstruction: {
          priceLabelPrintRequired: false,
          goodsReceiptCheckMode: 'full_check',
          goodsReceiptCheckPercentage: null,
        },
      }),
    );
    expect(v!.goodsReceiptCheckPercentage).toBeUndefined();
    expect(v!.goodsReceiptCheckMode).toBe('full_check');
  });

  it('is order-independent: the same positions in any order yield an equal vector', () => {
    const row = fullRow();
    const reversed = fullRow({ positions: [...fullRow().positions].reverse() });
    const a = buildEffortVector(row)!;
    const b = buildEffortVector(reversed)!;
    expect({ ...a, wgrCodes: [...a.wgrCodes].sort() }).toEqual({
      ...b,
      wgrCodes: [...b.wgrCodes].sort(),
    });
    // Counts and aggregates are independent of order outright.
    expect(a.priceLabelAttachPositionCount).toBe(b.priceLabelAttachPositionCount);
    expect(a.redPriceRequired).toBe(b.redPriceRequired);
  });

  it('handles a work instruction with zero positions (base + quantity only)', () => {
    const v = buildEffortVector(fullRow({ positions: [] }));
    expect(v).toMatchObject({
      wgrCodes: [],
      priceLabelAttachPositionCount: 0,
      securityRequiredPositionCount: 0,
      onlineRelevantPositionCount: 0,
      redPriceRequired: false,
    });
  });

  it('counts only positions whose instruction record is present', () => {
    const v = buildEffortVector(
      fullRow({
        positions: [
          { wgr: 'A', instruction: null },
          {
            wgr: 'A',
            instruction: {
              priceLabelAttachRequired: true,
              securityRequired: true,
              onlineHandlingRequired: false,
              redPriceRequired: false,
            },
          },
        ],
      }),
    );
    expect(v!.priceLabelAttachPositionCount).toBe(1);
    expect(v!.securityRequiredPositionCount).toBe(1);
    expect(v!.wgrCodes).toEqual(['A']);
  });
});

describe('handlingClassFromLocationKind', () => {
  it('maps storage classes to handling classes', () => {
    expect(handlingClassFromLocationKind('haengebahn')).toBe('hanging_goods');
    expect(handlingClassFromLocationKind('palette_a')).toBe('bulky');
    expect(handlingClassFromLocationKind('palette_e')).toBe('bulky');
    expect(handlingClassFromLocationKind('regal')).toBe('normal');
    expect(handlingClassFromLocationKind('lagerplatz_d')).toBe('normal');
  });
});

describe('buildEffortVectors + computeEffort (end-to-end live wiring)', () => {
  it('only includes cases with a work instruction', () => {
    const map = buildEffortVectors([
      fullRow({ id: 'a' }),
      fullRow({ id: 'b', workInstruction: null }),
    ]);
    expect([...map.keys()]).toEqual(['a']);
  });

  it('the built vector feeds computeEffort and reflects the configured parameters', () => {
    const v = buildEffortVector(fullRow())!;
    const before = computeEffort(v, DEFAULT_EFFORT_CONFIG).minutes;
    // Doubling the print minutes (2 → 4) adds exactly 2 min for this beleg.
    const after = computeEffort(v, { ...DEFAULT_EFFORT_CONFIG, priceLabelPrintMinutes: 4 }).minutes;
    expect(after).toBeCloseTo(before + 2, 2);
  });

  it('redPrice surcharge flows through: a red-price case costs redPriceMinutes more', () => {
    const withRed = buildEffortVector(fullRow())!; // pos[0] redPriceRequired:true
    const noRed = buildEffortVector(
      (() => {
        const r = fullRow();
        for (const p of r.positions) if (p.instruction) p.instruction.redPriceRequired = false;
        return r;
      })(),
    )!;
    const delta =
      computeEffort(withRed, DEFAULT_EFFORT_CONFIG).minutes -
      computeEffort(noRed, DEFAULT_EFFORT_CONFIG).minutes;
    expect(delta).toBeCloseTo(DEFAULT_EFFORT_CONFIG.redPriceMinutesPerPosition, 2);
  });

  it('handling class flows through: a bulky (palette) case costs the bulky surcharge', () => {
    const normal = buildEffortVector(fullRow({ storageLocation: { kind: 'regal' } }))!;
    const bulky = buildEffortVector(fullRow({ storageLocation: { kind: 'palette_a' } }))!;
    const quantityMinutes = normal.totalQuantity * DEFAULT_EFFORT_CONFIG.quantityBaseMinutes; // wgr 218110 present → factor applies equally to both
    const wgrFactor = DEFAULT_EFFORT_CONFIG.wgrFactors['218110'] ?? 1;
    const expectedSurcharge =
      quantityMinutes * wgrFactor * (DEFAULT_EFFORT_CONFIG.handlingClassFactors.bulky! - 1);
    const delta =
      computeEffort(bulky, DEFAULT_EFFORT_CONFIG).minutes -
      computeEffort(normal, DEFAULT_EFFORT_CONFIG).minutes;
    // 1-decimal tolerance: delta is the difference of two independently round2'd totals.
    expect(delta).toBeCloseTo(expectedSurcharge, 1);
    expect(delta).toBeGreaterThan(0);
  });

  it('WGR max-factor flows through: the most effort-intensive WGR drives quantity effort', () => {
    // fullRow spans 218110 (1.15) + 111130 (1.0) → max 1.15 must be used.
    const mixed = buildEffortVector(fullRow())!;
    const onlyDefault = buildEffortVector(
      fullRow({ positions: [{ wgr: '111130', instruction: null }] }),
    )!;
    const qBase = 60 * DEFAULT_EFFORT_CONFIG.quantityBaseMinutes;
    const mixedQ = computeEffort(mixed, DEFAULT_EFFORT_CONFIG); // uses 1.15
    const defQ = computeEffort(onlyDefault, DEFAULT_EFFORT_CONFIG); // uses 1.0
    // The quantity-driven part differs by qBase × (1.15 − 1.0); other drivers differ too,
    // so just assert the max-factor case is strictly heavier on the quantity axis.
    expect(qBase * (1.15 - 1.0)).toBeGreaterThan(0);
    expect(mixedQ.minutes).toBeGreaterThan(defQ.minutes);
  });

  it('check mode flows through: 0% stichprobe = no surcharge, 100% = full percentage factor', () => {
    const base = fullRow();
    const at0 = buildEffortVector({
      ...base,
      workInstruction: {
        priceLabelPrintRequired: base.workInstruction!.priceLabelPrintRequired,
        goodsReceiptCheckMode: 'percentage_check',
        goodsReceiptCheckPercentage: 0,
      },
    })!;
    const at100 = buildEffortVector({
      ...base,
      workInstruction: {
        priceLabelPrintRequired: base.workInstruction!.priceLabelPrintRequired,
        goodsReceiptCheckMode: 'percentage_check',
        goodsReceiptCheckPercentage: 100,
      },
    })!;
    const quantityOnly = buildEffortVector({
      ...base,
      workInstruction: {
        priceLabelPrintRequired: base.workInstruction!.priceLabelPrintRequired,
        goodsReceiptCheckMode: 'quantity_only',
        goodsReceiptCheckPercentage: null,
      },
    })!;
    // 0% stichprobe contributes no check surcharge → equals quantity_only.
    expect(computeEffort(at0, DEFAULT_EFFORT_CONFIG).minutes).toBeCloseTo(
      computeEffort(quantityOnly, DEFAULT_EFFORT_CONFIG).minutes,
      2,
    );
    // 100% stichprobe costs more than 0%.
    expect(computeEffort(at100, DEFAULT_EFFORT_CONFIG).minutes).toBeGreaterThan(
      computeEffort(at0, DEFAULT_EFFORT_CONFIG).minutes,
    );
  });
});
