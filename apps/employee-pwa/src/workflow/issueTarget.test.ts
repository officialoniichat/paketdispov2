import { describe, expect, it } from 'vitest';
import { exampleAggregate } from '../domain/exampleAssignment.js';
import { parseScope, resolveIssueTarget } from './issueTarget.js';

const agg = exampleAggregate;

describe('parseScope', () => {
  it('accepts valid scopes', () => {
    expect(parseScope('position')).toBe('position');
    expect(parseScope('sku_line')).toBe('sku_line');
    expect(parseScope('case')).toBe('case');
  });
  it('returns undefined for unknown/empty values', () => {
    expect(parseScope('garbage')).toBeUndefined();
    expect(parseScope(null)).toBeUndefined();
  });
});

describe('resolveIssueTarget', () => {
  it('defaults to the whole case when no scope is given', () => {
    const t = resolveIssueTarget(agg, undefined, undefined);
    expect(t.scope).toBe('case');
    expect(t.scopeId).toBeUndefined();
    expect(t.label).toContain('WE 3656860');
  });

  it('resolves a position target with its number and article', () => {
    const t = resolveIssueTarget(agg, 'position', 'pos-3656860-2');
    expect(t).toMatchObject({ scope: 'position', scopeId: 'pos-3656860-2' });
    expect(t.label).toContain('Position 2');
  });

  it('resolves a SKU-line target back to its position and size', () => {
    const t = resolveIssueTarget(agg, 'sku_line', 'sku-3656860-3-2');
    expect(t).toMatchObject({ scope: 'sku_line', scopeId: 'sku-3656860-3-2' });
    expect(t.label).toContain('Position 3');
    expect(t.label).toContain('9');
  });

  it('resolves a box target to its shop area', () => {
    const t = resolveIssueTarget(agg, 'transport_box', 'box-3656860-1');
    expect(t.scope).toBe('transport_box');
    expect(t.label).toContain('Shopbereich');
  });

  it('falls back to the case when the scopeId is unknown (defensive)', () => {
    const t = resolveIssueTarget(agg, 'position', 'does-not-exist');
    expect(t.scope).toBe('case');
    expect(t.scopeId).toBeUndefined();
  });
});
