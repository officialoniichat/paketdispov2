import { createHash } from 'node:crypto';

/** Business fields that are bound into the tamper-evidence hash (§16.2). */
export interface HashableEvent {
  eventType: string;
  entityType: string;
  entityId: string;
  actorType: string;
  actorId?: string | null;
  timestamp: string; // ISO 8601
  payload: unknown;
  idempotencyKey?: string | null;
  correlationId?: string | null;
}

/**
 * Stable JSON: object keys are sorted recursively so serialisation is
 * independent of key order. This matters because Postgres JSONB does not
 * preserve insertion order — the hash computed at write time must match the
 * hash recomputed after reading the payload back (otherwise audits would
 * report false tampering).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
    );
  return `{${entries.join(',')}}`;
}

/**
 * Deterministic serialisation: fields are emitted in a fixed order with stable
 * (sorted) nested keys, so the same logical event always hashes identically,
 * independent of object key order or undefined-vs-missing differences.
 */
export function canonicalEventContent(event: HashableEvent): string {
  return stableStringify([
    event.eventType,
    event.entityType,
    event.entityId,
    event.actorType,
    event.actorId ?? null,
    event.timestamp,
    event.payload ?? null,
    event.idempotencyKey ?? null,
    event.correlationId ?? null,
  ]);
}

/** hash = sha256(prevHash || "" + canonical content). The chain root has prevHash = null. */
export function computeEventHash(prevHash: string | null, event: HashableEvent): string {
  return createHash('sha256')
    .update(prevHash ?? '')
    .update('\n')
    .update(canonicalEventContent(event))
    .digest('hex');
}

export interface ChainLink extends HashableEvent {
  hash: string;
  prevHash: string | null;
}

export interface ChainVerification {
  ok: boolean;
  /** index of the first event whose stored hash does not match recomputation. */
  brokenAtIndex?: number;
}

/**
 * Re-derives the hash chain over an ordered list of events and reports the first
 * link whose stored hash or prevHash linkage was altered (tamper detection).
 */
export function verifyChainLinks(events: readonly ChainLink[]): ChainVerification {
  let prev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    if (event.prevHash !== prev) {
      return { ok: false, brokenAtIndex: i };
    }
    const expected = computeEventHash(prev, event);
    if (event.hash !== expected) {
      return { ok: false, brokenAtIndex: i };
    }
    prev = event.hash;
  }
  return { ok: true };
}
