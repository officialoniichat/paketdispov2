import { describe, expect, it } from 'vitest';
import { exampleAggregate } from '../domain/exampleAssignment.js';
import {
  canCompleteCase,
  checkQuantity,
  confirmBoxAssignment,
  confirmPickup,
  confirmPosition,
  initialProgress,
  markLabelsPrinted,
  markPrepared,
  nextBestAction,
  openCarton,
  printBoxLabel,
  requiresQuantityCheck,
  scanMatches,
  sealBox,
} from './workflowModel.js';

const agg = exampleAggregate;
const p0 = initialProgress(agg, '2026-06-15T00:00:00.000Z');

describe('nextBestAction', () => {
  it('starts at the pickup scan', () => {
    expect(nextBestAction(p0, agg).label).toBe('Lagerplatz scannen');
  });

  it('forces label printing before opening the carton (§9.5)', () => {
    const afterPickup = confirmPickup(p0);
    expect(nextBestAction(afterPickup, agg).label).toBe('Etiketten drucken');
    const afterLabels = markLabelsPrinted(afterPickup);
    expect(nextBestAction(afterLabels, agg).label).toBe('Karton geöffnet');
    const afterCarton = openCarton(afterLabels);
    expect(nextBestAction(afterCarton, agg).label).toBe('Sortierung fertig');
  });

  it('routes to Boxen sortieren after all positions confirmed', () => {
    let p = markPrepared(openCarton(markLabelsPrinted(confirmPickup(p0))));
    for (const pos of agg.positions) {
      p = checkQuantity(p, pos.id);
      p = confirmPosition(p, pos.id);
    }
    expect(nextBestAction(p, agg).step).toBe('sort');
  });
});

describe('scanMatches', () => {
  it('matches ignoring case/whitespace', () => {
    expect(scanMatches(' reg-07 ', 'REG-07')).toBe(true);
  });
  it('rejects a different code', () => {
    expect(scanMatches('REG-09', 'REG-07')).toBe(false);
  });
});

describe('confirmBoxAssignment', () => {
  it('sets the flag and moves to boxing', () => {
    const next = confirmBoxAssignment({ ...p0, step: 'sort' });
    expect(next.boxAssignmentConfirmed).toBe(true);
    expect(next.step).toBe('boxing');
  });
});

describe('guardrails', () => {
  it('always requires a quantity check, even for quantity_only ("Prüfung = Nein")', () => {
    expect(agg.workInstruction.goodsReceiptCheckMode).toBe('quantity_only');
    expect(requiresQuantityCheck(agg.workInstruction)).toBe(true);
  });

  it('blocks completion until positions, quantities and boxes are done', () => {
    let p = markPrepared(openCarton(markLabelsPrinted(confirmPickup(p0))));

    for (const pos of agg.positions) p = confirmPosition(p, pos.id);
    let gate = canCompleteCase(p, agg, 0);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Stückzahl'))).toBe(true);

    for (const pos of agg.positions) p = checkQuantity(p, pos.id);
    gate = canCompleteCase(p, agg, 0);
    expect(gate.ok).toBe(false); // boxes not sealed yet

    agg.boxTargets.forEach((_, i) => {
      p = printBoxLabel(p, i + 1);
      p = sealBox(p, i + 1);
    });
    gate = canCompleteCase(p, agg, 0);
    expect(gate.ok).toBe(true);
  });

  it('blocks completion while a problem is open', () => {
    let p = markPrepared(openCarton(markLabelsPrinted(confirmPickup(p0))));
    for (const pos of agg.positions) {
      p = confirmPosition(p, pos.id);
      p = checkQuantity(p, pos.id);
    }
    agg.boxTargets.forEach((_, i) => {
      p = printBoxLabel(p, i + 1);
      p = sealBox(p, i + 1);
    });
    const gate = canCompleteCase(p, agg, 1);
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain('Offenes Problem – erst klären');
  });
});
