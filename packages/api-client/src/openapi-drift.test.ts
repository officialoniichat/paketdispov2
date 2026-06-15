import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CI drift guard: the committed api-client OpenAPI copy must stay byte-identical
 * to the backend's source-of-truth spec. If they diverge, the generated
 * `src/generated/schema.ts` is stale and the frontends would call endpoints
 * with the wrong types. Re-run:
 *   pnpm --filter @paket/backend-api build
 *   pnpm --filter @paket/backend-api run openapi:generate
 *   cp apps/backend-api/openapi.json packages/api-client/openapi/openapi.json
 *   pnpm --filter @paket/api-client run generate
 */
describe('openapi spec drift', () => {
  it('api-client copy is byte-identical to the backend source spec', () => {
    // src/ -> packages/api-client -> packages -> <workspace root>
    const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const backendSpec = readFileSync(
      resolve(workspaceRoot, 'apps/backend-api/openapi.json'),
      'utf8',
    );
    const clientSpec = readFileSync(
      resolve(workspaceRoot, 'packages/api-client/openapi/openapi.json'),
      'utf8',
    );

    expect(clientSpec).toBe(backendSpec);
  });
});
