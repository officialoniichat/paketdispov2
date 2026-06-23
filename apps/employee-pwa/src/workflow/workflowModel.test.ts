import { describe, expect, it } from 'vitest';
import { exampleAggregate } from '../domain/exampleAssignment.js';
import {
  canCompleteCase,
  canOpenCarton,
  checkQuantity,
  completeCase,
  initialProgress,
  markLabelsPrinted,
  openCarton,
  partialComplete,
  requiresQuantityCheck,
  scanMatches,
} from './workflowModel.js';

const agg = exampleAggregate;
const p0 = initialProgress(agg, '2026-06-15T00:00:00.000Z');

/** Confirm the minimum quantity for every position of the example Beleg. */
function checkAll(p = p0) {
  return agg.positions.reduce((acc, pos) => checkQuantity(acc, pos.id), p);
}

describe('initialProgress', () => {
  it('starts in the process step, nothing done', () => {
    expect(p0.step).toBe('process');
    expect(p0.labelsPrinted).toBe(false);
    expect(p0.cartonOpened).toBe(false);
    expect(p0.quantityCheckedPositionIds).toEqual([]);
  });
});

describe('§G.2 print-before-unpack guardrail', () => {
  it('blocks opening the carton until the price labels are printed', () => {
    expect(agg.workInstruction.priceLabelPrintRequired).toBe(true);
    expect(canOpenCarton(p0, agg.workInstruction)).toBe(false);
    expect(canOpenCarton(markLabelsPrinted(p0), agg.workInstruction)).toBe(true);
  });
});

describe('checkQuantity', () => {
  it('adds a position id and is idempotent', () => {
    const once = checkQuantity(p0, 'pos-3656860-1');
    const twice = checkQuantity(once, 'pos-3656860-1');
    expect(twice.quantityCheckedPositionIds).toEqual(['pos-3656860-1']);
  });
});

describe('minimum-quantity guardrail', () => {
  it('always requires a quantity check, even for quantity_only ("Prüfung = Nein")', () => {
    expect(agg.workInstruction.goodsReceiptCheckMode).toBe('quantity_only');
    expect(requiresQuantityCheck(agg.workInstruction)).toBe(true);
  });
});

describe('canCompleteCase', () => {
  it('blocks while the price labels are not printed', () => {
    const gate = canCompleteCase(checkAll(p0), agg, 0);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Preisetiketten'))).toBe(true);
  });

  it('blocks while a minimum-quantity check is open', () => {
    const gate = canCompleteCase(markLabelsPrinted(p0), agg, 0);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Stückzahl'))).toBe(true);
  });

  it('blocks while a problem is open', () => {
    const ready = checkAll(markLabelsPrinted(p0));
    const gate = canCompleteCase(ready, agg, 1);
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain('Offenes Problem – erst klären');
  });

  it('passes once labels are printed and every quantity is checked (boxing never gates)', () => {
    const ready = checkAll(openCarton(markLabelsPrinted(p0)));
    expect(canCompleteCase(ready, agg, 0).ok).toBe(true);
  });
});

describe('completion transitions', () => {
  it('completeCase moves to done, not partial', () => {
    const done = completeCase(p0);
    expect(done.step).toBe('done');
    expect(done.partial).toBe(false);
  });

  it('partialComplete moves to done and flags partial', () => {
    const done = partialComplete(p0);
    expect(done.step).toBe('done');
    expect(done.partial).toBe(true);
  });
});

describe('scanMatches (optional collect scan)', () => {
  it('matches ignoring case/whitespace', () => {
    expect(scanMatches(' r27 ', 'R27')).toBe(true);
  });
  it('rejects a different code', () => {
    expect(scanMatches('R28', 'R27')).toBe(false);
  });
});
