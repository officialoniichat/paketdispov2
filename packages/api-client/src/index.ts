import { goodsReceiptCaseSchema, type GoodsReceiptCase } from '@paket/domain-types';

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
}

/**
 * Minimal typed API client placeholder. EPIC 6 replaces the hand-written calls
 * with a generated OpenAPI client; the shared Zod schemas validate responses.
 */
export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  private async get<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      headers: this.options.token ? { authorization: `Bearer ${this.options.token}` } : {},
    });
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return schema.parse(await res.json());
  }

  getCase(caseId: string): Promise<GoodsReceiptCase> {
    return this.get(`/api/cases/${caseId}`, goodsReceiptCaseSchema);
  }
}
