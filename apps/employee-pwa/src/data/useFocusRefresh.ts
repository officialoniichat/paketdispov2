/**
 * Re-fetches the assigned bundle whenever the app regains focus.
 *
 * This is the integration point for live "new Beleg assigned" delivery: today
 * it refreshes on focus/visibility (cheap, robust, offline-safe); a future push
 * channel can call the same loader. No-op in offline-demo mode (no backend).
 */
import { useEffect } from 'react';
import { isBackendEnabled } from './api.js';
import { loadAssignedWork } from '../db/sync.js';

export function useFocusRefresh(): void {
  useEffect(() => {
    if (!isBackendEnabled) return;

    const refresh = (): void => {
      void loadAssignedWork().catch(() => {
        // Non-fatal: keep the cached bundle when a background refresh fails.
      });
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
