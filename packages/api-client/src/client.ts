/**
 * Typed backend client (§12.2: REST/OpenAPI first).
 *
 * `createApiClient` wraps openapi-fetch with the path/operation types generated
 * from the OpenAPI spec (`src/generated/schema.ts`), so every call is typed
 * against the backend contract. Responses can additionally be validated at
 * runtime against the shared @paket/domain-types Zod schemas (trust but verify).
 */
import createClient, { type Client } from 'openapi-fetch';
import { goodsReceiptCaseSchema, type GoodsReceiptCase } from '@paket/domain-types';
import type { paths } from './generated/schema.js';

export interface ApiClientOptions {
  baseUrl: string;
  /** Bearer token (OIDC access token); omitted for same-origin cookie auth. */
  token?: string;
}

/** A fully typed openapi-fetch client for the Paketlagerdispo backend. */
export type PaketApiClient = Client<paths>;

export function createApiClient({ baseUrl, token }: ApiClientOptions): PaketApiClient {
  return createClient<paths>({
    baseUrl,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Fetch a single case and validate the payload against the shared Zod schema.
 * Demonstrates the typed-client + runtime-validation pairing.
 */
export async function fetchCaseValidated(
  client: PaketApiClient,
  caseId: string,
): Promise<GoodsReceiptCase> {
  const { data, error } = await client.GET('/api/cases/{caseId}', {
    params: { path: { caseId } },
  });
  if (error || !data) {
    throw new Error(`getCase(${caseId}) failed`);
  }
  return goodsReceiptCaseSchema.parse(data);
}
