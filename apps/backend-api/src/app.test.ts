import { describe, expect, it } from 'vitest';
import { DOMAIN_MODULES } from './modules/index.js';

describe('modular monolith boundaries', () => {
  it('declares all §12.3 domain modules', () => {
    expect(DOMAIN_MODULES).toEqual([
      'document',
      'workflow',
      'assignment',
      'route',
      'issue',
      'print',
      'reporting',
      'admin',
    ]);
  });
});
