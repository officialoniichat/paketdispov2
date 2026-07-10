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
 * Render an openapi-fetch error channel value as German prose for a user-facing
 * message. Shared with the mutation layer ({@link ./mutations}) so a failed read
 * and a failed write read identically in the cockpit.
 */
export function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (cause === undefined || cause === null) return 'unbekannter Fehler';
  return JSON.stringify(cause);
}

/**
 * Unwrap an openapi-fetch result, throwing on failure so React Query sees it.
 * A failure is the error channel being set or a missing body. `label` names the
 * failed operation as a German noun phrase („Laden der Belege"), because the
 * feature screens render `error.message` straight into an Alert. Mutations wrap
 * the failure in their own error type instead via {@link hasFetchError}.
 */
export function unwrap<T>(result: FetchResult<T>, label: string): T {
  if (hasFetchError(result) || result.data === undefined) {
    throw new Error(`${label} fehlgeschlagen (${describeCause(result.error)})`);
  }
  return result.data;
}
