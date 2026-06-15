import { describe, expect, it } from 'vitest';
import {
  canonicalEventContent,
  computeEventHash,
  verifyChainLinks,
  type ChainLink,
  type HashableEvent,
} from './event-hash.js';

function event(overrides: Partial<HashableEvent> = {}): HashableEvent {
  return {
    eventType: 'case.completed',
    entityType: 'GoodsReceiptCase',
    entityId: 'case-1',
    actorType: 'employee',
    actorId: 'user-1',
    timestamp: '2026-06-15T10:00:00.000Z',
    payload: { from: 'boxing', to: 'completed' },
    ...overrides,
  };
}

/** Builds a valid chain of N links over the given events. */
function buildChain(events: HashableEvent[]): ChainLink[] {
  const links: ChainLink[] = [];
  let prev: string | null = null;
  for (const e of events) {
    const hash = computeEventHash(prev, e);
    links.push({ ...e, hash, prevHash: prev });
    prev = hash;
  }
  return links;
}

describe('event hash chain (§16.2 manipulationsgeschützt)', () => {
  it('is deterministic regardless of object key order', () => {
    const a = canonicalEventContent(event({ payload: { to: 'completed', from: 'boxing' } }));
    const b = canonicalEventContent(event({ payload: { from: 'boxing', to: 'completed' } }));
    expect(a).toBe(b);
    expect(computeEventHash(null, event())).toBe(computeEventHash(null, event()));
  });

  it('chains hashes so each link binds the previous hash', () => {
    const links = buildChain([event({ entityId: 'a' }), event({ entityId: 'b' })]);
    expect(links[0]!.prevHash).toBeNull();
    expect(links[1]!.prevHash).toBe(links[0]!.hash);
    expect(verifyChainLinks(links)).toEqual({ ok: true });
  });

  it('detects a tampered payload', () => {
    const links = buildChain([event({ entityId: 'a' }), event({ entityId: 'b' })]);
    const tampered = [...links];
    tampered[1] = { ...tampered[1]!, payload: { from: 'boxing', to: 'cancelled' } };
    const result = verifyChainLinks(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
  });

  it('detects a deleted middle event (broken prevHash linkage)', () => {
    const links = buildChain([
      event({ entityId: 'a' }),
      event({ entityId: 'b' }),
      event({ entityId: 'c' }),
    ]);
    const withGap = [links[0]!, links[2]!];
    const result = verifyChainLinks(withGap);
    expect(result.ok).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
  });

  it('detects a forged hash', () => {
    const links = buildChain([event()]);
    const forged = [{ ...links[0]!, hash: 'deadbeef' }];
    expect(verifyChainLinks(forged).ok).toBe(false);
  });

  it('accepts an empty chain', () => {
    expect(verifyChainLinks([])).toEqual({ ok: true });
  });
});
