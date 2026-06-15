import { describe, expect, it } from 'vitest';
import { buildSkipEvent, SkipReasonRequiredError } from './skip.js';

describe('buildSkipEvent', () => {
  it('throws when no reason is given', () => {
    expect(() =>
      buildSkipEvent({ entityType: 'case', entityId: 'c1', reason: '   ', skipped: 'position' }),
    ).toThrow(SkipReasonRequiredError);
  });

  it('produces a step.skipped event carrying the reason', () => {
    const event = buildSkipEvent({
      entityType: 'case',
      entityId: 'c1',
      reason: 'beschädigt',
      skipped: 'position',
    });
    expect(event.eventType).toBe('step.skipped');
    expect((event.payload as { reason: string }).reason).toBe('beschädigt');
  });
});
