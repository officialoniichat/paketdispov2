import { describe, expect, it } from 'vitest';
import { samplePrioCase } from './index.js';

describe('fixtures', () => {
  it('sample prio case validates and has no section', () => {
    expect(samplePrioCase.section).toBeNull();
    expect(samplePrioCase.priorityFlags).toContain('prio');
  });
});
