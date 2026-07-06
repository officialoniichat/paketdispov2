import { describe, expect, it } from 'vitest';
import { exampleAggregate } from '../domain/exampleAssignment.js';
import {
  canCompleteCase,
  completeCase,
  hasProgress,
  initialProgress,
  partialComplete,
  requiresQuantityCheck,
  scanMatches,
  setSkuQuantity,
  togglePositionChecked,
} from './workflowModel.js';

const agg = exampleAggregate;
const p0 = initialProgress(agg, '2026-06-15T00:00:00.000Z');

/** Check every position of the example Beleg. */
function checkAll(p = p0) {
  return agg.positions.reduce((acc, pos) => togglePositionChecked(acc, pos.id), p);
}

describe('initialProgress', () => {
  it('starts in the process step, nothing done', () => {
    expect(p0.step).toBe('process');
    expect(p0.quantityCheckedPositionIds).toEqual([]);
    expect(p0.confirmedQuantities).toEqual({});
    expect(hasProgress(p0)).toBe(false);
  });
});

describe('togglePositionChecked (D5: un-checkable)', () => {
  it('adds a position id and removes it again on the second toggle', () => {
    const once = togglePositionChecked(p0, 'pos-3656860-1');
    expect(once.quantityCheckedPositionIds).toEqual(['pos-3656860-1']);
    const twice = togglePositionChecked(once, 'pos-3656860-1');
    expect(twice.quantityCheckedPositionIds).toEqual([]);
  });
});

describe('setSkuQuantity (D2 Mehr-/Mindermengen per Größe)', () => {
  it('records a deviation and clears it when the count returns to Soll', () => {
    const minus = setSkuQuantity(p0, 'sku-1', 1, 2);
    expect(minus.confirmedQuantities).toEqual({ 'sku-1': 1 });
    const backToSoll = setSkuQuantity(minus, 'sku-1', 2, 2);
    expect(backToSoll.confirmedQuantities).toEqual({});
  });

  it('never goes below zero', () => {
    expect(setSkuQuantity(p0, 'sku-1', -3, 2).confirmedQuantities).toEqual({ 'sku-1': 0 });
  });
});

describe('minimum-quantity guardrail', () => {
  it('always requires the position check, even for quantity_only ("Prüfung = Nein")', () => {
    expect(agg.workInstruction.goodsReceiptCheckMode).toBe('quantity_only');
    expect(requiresQuantityCheck(agg.workInstruction)).toBe(true);
  });
});

describe('canCompleteCase', () => {
  it('blocks while a position check is open', () => {
    const gate = canCompleteCase(p0, agg, 0);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Positionen'))).toBe(true);
  });

  it('blocks while a problem is open', () => {
    const gate = canCompleteCase(checkAll(p0), agg, 1);
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain('Offenes Problem – erst klären');
  });

  it('passes once every position is checked (printing/boxing never gate — C4)', () => {
    expect(canCompleteCase(checkAll(p0), agg, 0).ok).toBe(true);
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
