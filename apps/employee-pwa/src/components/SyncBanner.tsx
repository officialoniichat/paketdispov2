/**
 * Sticky sync status (§E.6: status always visible, colour + text never colour
 * alone). Hidden when fully synced to keep the work surface calm; always shown
 * offline so the worker trusts that nothing is lost.
 */
import type { JSX } from 'react';
import Alert, { type AlertColor } from '@mui/material/Alert';
import { useSync } from '../offline/useSync.js';
import type { SyncBannerState } from '../offline/types.js';

const META: Record<SyncBannerState, { severity: AlertColor; label: string }> = {
  synced: { severity: 'success', label: 'Alles synchronisiert' },
  pending: { severity: 'info', label: 'Änderungen werden synchronisiert' },
  syncing: { severity: 'info', label: 'Synchronisiere …' },
  offline: { severity: 'warning', label: 'Offline – Arbeit wird lokal gespeichert' },
  conflict: { severity: 'error', label: 'Sync-Konflikt – bitte Teamlead informieren' },
};

export function SyncBanner(): JSX.Element | null {
  const snapshot = useSync();
  if (snapshot.state === 'synced') return null;
  const meta = META[snapshot.state];
  const suffix = snapshot.pendingCount > 0 ? ` (${snapshot.pendingCount} offen)` : '';
  return (
    <Alert severity={meta.severity} variant="filled" sx={{ borderRadius: 0 }}>
      {meta.label}
      {suffix}
    </Alert>
  );
}
