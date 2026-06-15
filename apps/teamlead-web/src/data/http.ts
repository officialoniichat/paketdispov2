/**
 * Shared openapi-fetch result handling for the teamlead data layer.
 *
 * Every generated client call resolves to a `{ data, error }` result; the read
 * modules (see {@link ./remoteDataset}, {@link ./belege}, {@link ./admin}) and the
 * mutation layer ({@link ./mutations}) all need the same "the request failed when
 * the error channel is set or the body is missing" rule, so a failed call
 * surfaces to TanStack Query's `error` state instead of silently yielding
 * `undefined`. This is the single source of that rule.
 */

/** The shape every openapi-fetch call resolves to. */
export interface FetchResult<T> {
  data?: T;
  error?: unknown;
}

/** True when the openapi-fetch error channel is set (the request itself failed). */
export function hasFetchError<T>(result: FetchResult<T>): boolean {
  return result.error !== undefined && result.error !== null;
}

/**
 * Unwrap an openapi-fetch result, throwing on failure so React Query sees it.
 * A failure is the error channel being set or a missing body. `label` names the
 * endpoint for the thrown message. Mutations wrap the failure in their own error
 * type instead via {@link hasFetchError}.
 */
export function unwrap<T>(result: FetchResult<T>, label: string): T {
  if (hasFetchError(result) || result.data === undefined) {
    throw new Error(`Backend request failed: ${label} (${JSON.stringify(result.error)})`);
  }
  return result.data;
}
