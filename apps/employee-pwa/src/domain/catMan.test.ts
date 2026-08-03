import { describe, expect, it } from 'vitest';
import { catManDateLabel, isCatManOverdue, localDayIso } from './catMan.js';

describe('catManDateLabel', () => {
  it('formats an ISO day as a German date', () => {
    expect(catManDateLabel('2026-07-31')).toBe('31.07.2026');
  });

  it('is null without a Termin', () => {
    expect(catManDateLabel(undefined)).toBeNull();
    expect(catManDateLabel(null)).toBeNull();
    expect(catManDateLabel('')).toBeNull();
  });

  it('is null for an unparsable value instead of rendering "Invalid Date"', () => {
    expect(catManDateLabel('kein-datum')).toBeNull();
  });
});

describe('isCatManOverdue', () => {
  it('marks a Termin before the reference day as overdue', () => {
    expect(isCatManOverdue('2026-07-31', '2026-08-03')).toBe(true);
  });

  it('does NOT mark today as overdue — today it is due, not missed', () => {
    expect(isCatManOverdue('2026-08-03', '2026-08-03')).toBe(false);
  });

  it('does not mark a future Termin as overdue', () => {
    expect(isCatManOverdue('2026-08-10', '2026-08-03')).toBe(false);
  });

  it('compares across month and year boundaries', () => {
    expect(isCatManOverdue('2026-12-31', '2027-01-01')).toBe(true);
    expect(isCatManOverdue('2027-01-01', '2026-12-31')).toBe(false);
  });

  it('is false without a Termin — no date is not an overdue date', () => {
    expect(isCatManOverdue(undefined, '2026-08-03')).toBe(false);
    expect(isCatManOverdue(null, '2026-08-03')).toBe(false);
  });
});

describe('localDayIso', () => {
  it('returns the device day as an ISO day', () => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      `${now.getMonth() + 1}`.padStart(2, '0'),
      `${now.getDate()}`.padStart(2, '0'),
    ].join('-');
    expect(localDayIso()).toBe(expected);
  });

  it('is a valid input for the overdue comparison', () => {
    expect(localDayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
