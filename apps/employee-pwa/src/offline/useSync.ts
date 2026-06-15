/**
 * App-level sync controller. Watches the outbox and online status and drains
 * the queue whenever there is pending work and a connection. Returns the
 * Sync-Banner snapshot (§E.6: colour + text, never colour alone).
 */
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useOnlineStatus } from './useOnlineStatus.js';
import { countByStatus, listSyncable } from './outboxStore.js';
import { runSync } from './syncEngine.js';
import { mockTransport, type SyncTransport } from './transport.js';
import type { SyncBannerState, SyncSnapshot } from './types.js';

export function useSync(transport: SyncTransport = mockTransport): SyncSnapshot {
  const online = useOnlineStatus();
  const syncableCount = useLiveQuery(() => listSyncable().then((e) => e.length), [], 0) ?? 0;
  const conflictCount = useLiveQuery(() => countByStatus('conflict'), [], 0) ?? 0;
  const [running, setRunning] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function tick(): Promise<void> {
      if (!online || syncableCount === 0 || runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      try {
        await runSync(transport);
        if (!cancelled) setLastSyncedAt(new Date().toISOString());
      } finally {
        runningRef.current = false;
        if (!cancelled) setRunning(false);
      }
    }
    void tick();
    return () => {
      cancelled = true;
    };
  }, [online, syncableCount, transport]);

  const state: SyncBannerState = !online
    ? 'offline'
    : conflictCount > 0
      ? 'conflict'
      : running
        ? 'syncing'
        : syncableCount > 0
          ? 'pending'
          : 'synced';

  return { state, pendingCount: syncableCount, conflictCount, lastSyncedAt };
}
