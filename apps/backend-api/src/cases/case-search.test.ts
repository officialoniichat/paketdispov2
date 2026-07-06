import { describe, expect, it } from 'vitest';
import { assignableSearchWhere, rankCaseSearchCandidates, type CaseSearchCandidate } from './case-search.js';

function candidate(partial: Partial<CaseSearchCandidate> & Pick<CaseSearchCandidate, 'id' | 'weBelegNo'>): CaseSearchCandidate {
  return {
    deliveryNoteNo: null,
    storageLocationCode: null,
    primaryShopNo: null,
    branchNo: '1',
    bookingDate: new Date('2026-06-01T00:00:00.000Z'),
    ...partial,
  };
}

describe('assignableSearchWhere', () => {
  it('always scopes to ready + unassigned', () => {
    const where = assignableSearchWhere({});
    expect(where).toEqual({ AND: [{ status: 'ready' }, { assignedBundleId: null }] });
  });

  it('adds a text OR-clause across WE-Nr/Lieferschein/Lagerplatz/Shop/Filiale when q is given', () => {
    const where = assignableSearchWhere({ q: 'abc' });
    expect(where).toEqual({
      AND: [
        { status: 'ready' },
        { assignedBundleId: null },
        {
          OR: [
            { weBelegNo: { contains: 'abc', mode: 'insensitive' } },
            { deliveryNoteNo: { contains: 'abc', mode: 'insensitive' } },
            { storageLocation: { is: { code: { contains: 'abc', mode: 'insensitive' } } } },
            { primaryShopNo: { contains: 'abc', mode: 'insensitive' } },
            { branchNo: { contains: 'abc', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('adds a bereich filter translated to storage-location kinds', () => {
    const where = assignableSearchWhere({ bereich: 'Regal' });
    expect(where).toEqual({
      AND: [
        { status: 'ready' },
        { assignedBundleId: null },
        { storageLocation: { is: { kind: { in: ['regal', 'lagerplatz_d'] } } } },
      ],
    });
  });

  it('adds shopNo/branchNo contains filters', () => {
    const where = assignableSearchWhere({ shopNo: '42', branchNo: '7' });
    expect(where).toEqual({
      AND: [
        { status: 'ready' },
        { assignedBundleId: null },
        { primaryShopNo: { contains: '42', mode: 'insensitive' } },
        { branchNo: { contains: '7', mode: 'insensitive' } },
      ],
    });
  });
});

describe('rankCaseSearchCandidates', () => {
  it('ranks exact WE-Nr match first, then starts-with, then contains, then other-field match', () => {
    const exact = candidate({ id: 'a', weBelegNo: 'WE-100', bookingDate: new Date('2026-06-05') });
    const startsWith = candidate({ id: 'b', weBelegNo: 'WE-1005', bookingDate: new Date('2026-06-01') });
    const contains = candidate({ id: 'c', weBelegNo: 'X-WE-100-Y', bookingDate: new Date('2026-06-01') });
    const otherField = candidate({ id: 'd', weBelegNo: 'ZZZ', primaryShopNo: 'WE-100', bookingDate: new Date('2026-06-01') });

    const ranked = rankCaseSearchCandidates([otherField, contains, startsWith, exact], 'WE-100');
    expect(ranked.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is case-insensitive', () => {
    const exact = candidate({ id: 'a', weBelegNo: 'we-100' });
    const other = candidate({ id: 'b', weBelegNo: 'ZZZ' });
    const ranked = rankCaseSearchCandidates([other, exact], 'WE-100');
    expect(ranked[0]!.id).toBe('a');
  });

  it('breaks ties within a tier by bookingDate ascending (oldest first)', () => {
    const older = candidate({ id: 'old', weBelegNo: 'ZZZ-1', bookingDate: new Date('2026-06-01') });
    const newer = candidate({ id: 'new', weBelegNo: 'ZZZ-2', bookingDate: new Date('2026-06-10') });
    const ranked = rankCaseSearchCandidates([newer, older], 'ZZZ');
    expect(ranked.map((c) => c.id)).toEqual(['old', 'new']);
  });

  it('with no q, sorts purely by bookingDate ascending (browse mode)', () => {
    const older = candidate({ id: 'old', weBelegNo: 'A', bookingDate: new Date('2026-06-01') });
    const newer = candidate({ id: 'new', weBelegNo: 'B', bookingDate: new Date('2026-06-10') });
    const ranked = rankCaseSearchCandidates([newer, older], undefined);
    expect(ranked.map((c) => c.id)).toEqual(['old', 'new']);
  });
});
