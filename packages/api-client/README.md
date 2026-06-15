# @paket/api-client

Typed client for the goods-receipt distribution backend (§12.2 – REST/OpenAPI first).

## What it provides

- `createApiClient({ baseUrl, token })` – an [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) client typed by the backend contract (`paths`/`operations`/`components` from `src/generated/schema.ts`).
- `fetchCaseValidated(client, caseId)` – example call that fetches a case and validates the payload against the shared `goodsReceiptCaseSchema` from `@paket/domain-types` (trust but verify).
- Re-exported contract types and `goodsReceiptCaseSchema` for runtime validation.

```ts
import { createApiClient, fetchCaseValidated } from '@paket/api-client';

const api = createApiClient({ baseUrl: '/', token });
const { data, error } = await api.GET('/api/cases', { params: { query: { status: 'ready' } } });
const validated = await fetchCaseValidated(api, caseId);
```

## OpenAPI types are generated (depends on EPIC 3)

The TypeScript types in `src/generated/schema.ts` are generated from an OpenAPI spec
with [`openapi-typescript`](https://openapi-ts.dev/):

```bash
pnpm --filter @paket/api-client generate
```

`openapi/openapi.json` is the **interim contract** (field names mirror
`@paket/domain-types`). When **EPIC 3** ships the backend that emits the canonical
OpenAPI document (REST/OpenAPI first), point the generator at it and regenerate:

1. Replace `openapi/openapi.json` with the backend-emitted spec
   (e.g. `curl http://localhost:3000/openapi.json -o openapi/openapi.json`),
   or change the `generate` script's input path to the backend output.
2. Run `pnpm --filter @paket/api-client generate`.
3. `pnpm --filter @paket/api-client typecheck` to surface any contract drift.

The generated file is committed so the package builds without a running backend.
