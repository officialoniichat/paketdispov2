/**
 * Sync transport port (§E.1 DI: ports & adapters). The SyncEngine talks to this
 * interface, so the real backend client (EPIC 3/4/5) can replace the pilot mock
 * without touching the queue logic.
 */
import type { OutboxEntry } from './types.js';

export type SyncResult =
  | { kind: 'accepted'; newVersion?: number }
  | { kind: 'conflict'; serverVersion: number }
  | { kind: 'error'; message: string };

export interface SyncTransport {
  send(entry: OutboxEntry): Promise<SyncResult>;
}

/**
 * Pilot default: acknowledges every event and echoes the next version. Replaced
 * by an api-client-backed adapter once the backend endpoints are wired.
 */
export const mockTransport: SyncTransport = {
  async send(entry) {
    const v = entry.expectedVersion;
    return { kind: 'accepted', newVersion: typeof v === 'number' ? v + 1 : undefined };
  },
};
