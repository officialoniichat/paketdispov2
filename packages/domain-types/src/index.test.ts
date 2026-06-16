import { describe, expect, it } from 'vitest';
import {
  goodsReceiptCaseSchema,
  priorityFlagSchema,
  sectionCodeSchema,
  workflowEventTypeSchema,
} from './index.js';

describe('domain-types schemas', () => {
  it('accepts a prio case without a section (Prio != Abschnitt)', () => {
    const parsed = goodsReceiptCaseSchema.parse({
      id: 'case-1',
      source: 'prohandel_api',
      externalRef: 'ph-booking-100',
      weBelegNo: 'WE-100',
      bookingDate: '2026-06-15',
      branchNo: '001',
      storageLocation: { id: 'loc-1', type: 'regal', code: 'R27', active: true },
      section: null,
      priorityFlags: ['prio'],
      totalQuantity: 42,
      status: 'ready',
      effortPoints: 12.5,
      estimatedMinutes: 30,
      version: 0,
    });
    expect(parsed.section).toBeNull();
    expect(parsed.priorityFlags).toContain('prio');
  });

  it('rejects non-existent section codes 5 and 6', () => {
    expect(() => sectionCodeSchema.parse(5)).toThrow();
    expect(() => sectionCodeSchema.parse(6)).toThrow();
    expect(sectionCodeSchema.parse(7)).toBe(7);
  });

  it('exposes the full workflow event taxonomy', () => {
    expect(workflowEventTypeSchema.parse('zst.created')).toBe('zst.created');
    expect(priorityFlagSchema.parse('catman_due')).toBe('catman_due');
  });
});
