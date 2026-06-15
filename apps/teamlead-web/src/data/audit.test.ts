import { describe, expect, it } from 'vitest';
import { MissingReasonError, assertReason, createOverrideEvent, isValidReason } from './audit.js';

const NOW = new Date('2026-06-15T09:30:00.000Z');

describe('reason enforcement (§8.4 – nur mit Grund)', () => {
  it('rejects blank or too-short reasons', () => {
    expect(isValidReason('')).toBe(false);
    expect(isValidReason('  ')).toBe(false);
    expect(isValidReason('ok')).toBe(false);
    expect(isValidReason('Kunde wartet')).toBe(true);
  });

  it('assertReason throws MissingReasonError without a reason', () => {
    expect(() => assertReason('parken', '')).toThrow(MissingReasonError);
  });

  it('createOverrideEvent refuses to produce an event without a reason', () => {
    expect(() =>
      createOverrideEvent({ action: 'entziehen', entityId: 'case-1', reason: '', actorId: 'tl-1' }),
    ).toThrow(MissingReasonError);
  });
});

describe('createOverrideEvent (§8.4 audit)', () => {
  it('records reason, actor and previous/new assignment', () => {
    const event = createOverrideEvent(
      {
        action: 'entziehen',
        entityId: 'case-1',
        reason: '  Überlastet  ',
        actorId: 'tl-1',
        previousBundleId: 'bnd-anna',
      },
      NOW,
    );
    expect(event.eventType).toBe('assignment.overridden');
    expect(event.actorType).toBe('teamlead');
    expect(event.actorId).toBe('tl-1');
    expect(event.timestamp).toBe(NOW.toISOString());
    expect(event.payload.reason).toBe('Überlastet');
    expect(event.payload.previousBundleId).toBe('bnd-anna');
  });

  it('maps park/prioritise to their own event types', () => {
    const park = createOverrideEvent(
      { action: 'parken', entityId: 'case-2', reason: 'Klärung', actorId: 'tl-1' },
      NOW,
    );
    const prio = createOverrideEvent(
      { action: 'priorisieren', entityId: 'case-3', reason: 'Kunde wartet', actorId: 'tl-1' },
      NOW,
    );
    expect(park.eventType).toBe('case.parked');
    expect(prio.eventType).toBe('case.prioritized');
  });
});
