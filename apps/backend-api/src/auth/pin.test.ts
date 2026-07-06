import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from './pin.js';

describe('pin hashing', () => {
  it('verifies a correct PIN against its hash', async () => {
    const hash = await hashPin('4711');
    await expect(verifyPin('4711', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const hash = await hashPin('4711');
    await expect(verifyPin('0000', hash)).resolves.toBe(false);
  });

  it('rejects verification against a null hash', async () => {
    await expect(verifyPin('4711', null)).resolves.toBe(false);
  });
});
