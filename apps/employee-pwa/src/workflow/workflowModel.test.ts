import { describe, expect, it } from 'vitest';
import { exampleAggregate } from '../domain/exampleAssignment.js';
import {
  canCompleteCase,
  checkQuantity,
  confirmPickup,
  confirmPosition,
  initialProgress,
  markLabelsPrinted,
  markPrepared,
  nextBestAction,
  printBoxLabel,
  requiresQuantityCheck,
  sealBox,
} from './workflowModel.js';

const agg = exampleAggregate;
const p0 = initialProgress(agg, 'bundle-test', '2026-06-15T00:00:00.000Z');

describe('nextBestAction', () => {
  it('starts at the pickup scan', () => {
    expect(nextBestAction(p0, agg).label).toBe('Lagerplatz scannen');
  });

  it('forces label printing before sorting (§9.5)', () => {
    const afterPickup = confirmPickup(p0);
    expect(nextBestAction(afterPickup, agg).label).toBe('Etiketten drucken');
    const afterLabels = markLabelsPrinted(afterPickup);
    expect(nextBestAction(afterLabels, agg).label).toBe('Sortierung fertig');
  });
});

describe('guardrails', () => {
  it('always requires a quantity check, even for quantity_only ("Prüfung = Nein")', () => {
    expect(agg.workInstruction.goodsReceiptCheckMode).toBe('quantity_only');
    expect(requiresQuantityCheck(agg.workInstruction)).toBe(true);
  });

  it('blocks completion until positions, quantities and boxes are done', () => {
    let p = markPrepared(markLabelsPrinted(confirmPickup(p0)));

    for (const pos of agg.positions) p = confirmPosition(p, pos.id);
    let gate = canCompleteCase(p, agg);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Stückzahl'))).toBe(true);

    for (const pos of agg.positions) p = checkQuantity(p, pos.id);
    gate = canCompleteCase(p, agg);
    expect(gate.ok).toBe(false); // boxes not sealed yet

    agg.boxTargets.forEach((_, i) => {
      p = printBoxLabel(p, i + 1);
      p = sealBox(p, i + 1);
    });
    gate = canCompleteCase(p, agg);
    expect(gate.ok).toBe(true);
  });
});
