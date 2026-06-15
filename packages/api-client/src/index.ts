/**
 * @paket/api-client – typed client for the goods-receipt distribution backend.
 *
 * The transport is generated from the OpenAPI spec (openapi-typescript +
 * openapi-fetch); the shared @paket/domain-types Zod schemas provide optional
 * runtime validation. Regenerate types with `pnpm --filter @paket/api-client
 * generate` whenever the backend spec changes (EPIC 3+).
 */
export {
  createApiClient,
  fetchCaseValidated,
  type ApiClientOptions,
  type PaketApiClient,
} from './client.js';

// Generated contract types (paths, operations, component schemas).
export type { paths, components, operations } from './generated/schema.js';

// Re-export the shared case schema so callers can validate without a second dep.
export { goodsReceiptCaseSchema, type GoodsReceiptCase } from '@paket/domain-types';
