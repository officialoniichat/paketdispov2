/**
 * PIN hashing for seed data, mirroring `apps/backend-api/src/auth/pin.ts`
 * exactly (same library, same cost factor) rather than importing that module
 * across the package boundary — `pin.ts` has no decorators/DI concerns, so
 * duplicating this one-line helper is simpler and more robust than reaching
 * into `../../../backend-api/src/auth/pin.js` (see fixtures/prisma-client.ts
 * for the one place this harness *does* reach across, where duplication
 * is not practical).
 */
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}
