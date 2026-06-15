import { describe, expect, it } from 'vitest';
import type { Id, StorageLocation } from '@paket/domain-types';
import { buildPickupSequence, type PickupCase } from './pickup-order.js';

const AT = '2026-06-15T08:00:00+02:00';

function loc(id: string, type: StorageLocation['type'], code: string): StorageLocation {
  return { id, type, code, active: true };
}

function pc(caseId: string, location: StorageLocation): PickupCase {
  return { caseId, location };
}

describe('buildPickupSequence (§D.3) — order inside a finished bundle', () => {
  it('orders by location type then number in numeric_fallback mode', () => {
    const cases = [
      pc('c1', loc('l-pb4', 'palette', 'B-4')),
      pc('c2', loc('l-r18', 'regal', 'R18')),
      pc('c3', loc('l-r7', 'regal', 'R7')),
    ];
    const seq = buildPickupSequence('b1', 'e1', 'ws-1', cases, { calculatedAt: AT });
    // Regale (7,18) before Palette (B-4); numeric within type
    expect(seq.stops.map((s) => s.locationCode)).toEqual(['R7', 'R18', 'B-4']);
    expect(seq.stops.map((s) => s.sequence)).toEqual([0, 1, 2]);
    expect(seq.calculationMode).toBe('numeric_fallback');
  });

  it('parses multi-number codes (e.g. HB-5/234) component-wise', () => {
    const cases = [
      pc('c1', loc('l-hb5-234', 'haengebahn', 'HB-5/234')),
      pc('c2', loc('l-hb5-12', 'haengebahn', 'HB-5/12')),
    ];
    const seq = buildPickupSequence('b1', 'e1', 'ws-1', cases, { calculatedAt: AT });
    expect(seq.stops.map((s) => s.locationCode)).toEqual(['HB-5/12', 'HB-5/234']);
  });

  it('groups multiple cases at the same location into one stop', () => {
    const r7 = loc('l-r7', 'regal', 'R7');
    const cases = [pc('c2', r7), pc('c1', r7), pc('c3', loc('l-r9', 'regal', 'R9'))];
    const seq = buildPickupSequence('b1', 'e1', 'ws-1', cases, { calculatedAt: AT });
    expect(seq.stops).toHaveLength(2);
    expect(seq.stops[0]?.orderIds).toEqual(['c1', 'c2']); // sorted, deterministic
  });

  it('honours an explicit manual_sort_order, falling back to type+number for the rest', () => {
    const cases = [
      pc('c1', loc('l-r7', 'regal', 'R7')),
      pc('c2', loc('l-pb4', 'palette', 'B-4')),
      pc('c3', loc('l-r9', 'regal', 'R9')),
    ];
    const seq = buildPickupSequence('b1', 'e1', 'ws-1', cases, {
      mode: 'manual_sort_order',
      orderedLocationIds: ['l-pb4', 'l-r7'] as Id[],
      calculatedAt: AT,
    });
    // Manual: B-4 then R7; R9 not listed → after, by type+number
    expect(seq.stops.map((s) => s.locationCode)).toEqual(['B-4', 'R7', 'R9']);
    expect(seq.calculationMode).toBe('manual_sort_order');
  });

  it('produces a deterministic result regardless of input order', () => {
    const a = [
      pc('c1', loc('l-r7', 'regal', 'R7')),
      pc('c2', loc('l-d3', 'lagerplatz_d', 'D-3')),
      pc('c3', loc('l-pb4', 'palette', 'B-4')),
    ];
    const b = [a[2]!, a[0]!, a[1]!];
    const seqA = buildPickupSequence('b1', 'e1', 'ws-1', a, { calculatedAt: AT });
    const seqB = buildPickupSequence('b1', 'e1', 'ws-1', b, { calculatedAt: AT });
    expect(seqA.stops.map((s) => s.locationCode)).toEqual(seqB.stops.map((s) => s.locationCode));
  });

  it('marks every stop as skip-allowed-with-reason and scan-required by default', () => {
    const seq = buildPickupSequence('b1', 'e1', 'ws-1', [pc('c1', loc('l-r7', 'regal', 'R7'))], {
      calculatedAt: AT,
    });
    expect(seq.stops[0]?.skipAllowedWithReason).toBe(true);
    expect(seq.stops[0]?.scanRequired).toBe(true);
  });
});
