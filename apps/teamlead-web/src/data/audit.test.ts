import { describe, expect, it } from 'vitest';
import {
  ACTOR_LABELS,
  MissingReasonError,
  assertReason,
  createOverrideEvent,
  formatAuditAction,
  isValidReason,
  toOverrideAction,
} from './audit.js';

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

describe('formatAuditAction (§8.4 – human-readable audit feed)', () => {
  it('prefers the recorded override action label', () => {
    expect(formatAuditAction('assignment.overridden', 'entziehen')).toBe('Paket entziehen');
    expect(formatAuditAction('case.parked', 'parken')).toBe('Parken');
  });

  it('falls back to a German event-type label, never a raw code', () => {
    expect(formatAuditAction('assignment.overridden')).toBe('Neu zugeteilt');
    expect(formatAuditAction('case.prioritized')).toBe('Priorisiert');
    expect(formatAuditAction('employee.profile_updated')).toBe('Stammdaten geändert');
  });

  it('never renders a raw machine code (no dotted event type leaks through)', () => {
    expect(formatAuditAction('case.cancelled')).toBe('Storniert');
    expect(formatAuditAction('case.cancelled')).not.toContain('.');
  });
});

describe('toOverrideAction (boundary narrowing, no corrupted-data assumptions)', () => {
  it('recognises the override vocabulary', () => {
    expect(toOverrideAction('entziehen')).toBe('entziehen');
    expect(toOverrideAction('priorisieren')).toBe('priorisieren');
  });

  it('returns undefined for absent or non-override values', () => {
    expect(toOverrideAction(undefined)).toBeUndefined();
    expect(toOverrideAction(null)).toBeUndefined();
    expect(toOverrideAction('case.cancelled')).toBeUndefined();
  });
});

describe('ACTOR_LABELS', () => {
  it('maps every actor to a German label, never the raw role token', () => {
    expect(ACTOR_LABELS.teamlead).toBe('Teamlead');
    expect(ACTOR_LABELS.employee).toBe('Mitarbeiter');
    expect(ACTOR_LABELS.system).toBe('System');
    expect(ACTOR_LABELS.admin).toBe('Admin');
  });
});
