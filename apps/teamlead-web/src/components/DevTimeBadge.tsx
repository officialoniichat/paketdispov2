/**
 * Global app-bar indicator for the dev-only server time override (A3): when
 * `/api/dev/scenarios` reports an active `timeOverride`, a warning chip makes
 * the frozen server time impossible to miss on EVERY cockpit surface.
 *
 * Dev-gated exactly like the "Dev / Szenarien" Admin tab: only reachable via
 * the tree-shaken lazy import in AppShell (see ../config/devPanel.ts) — never
 * part of a production bundle. Renders nothing while no override is active or
 * when the backend's /api/dev surface is off (404/403 → query error → null).
 */
import type { JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import { DEV_STATE_QUERY_KEY, fetchDevState, type DevScenariosDto } from '../data/dev.js';

const REFRESH_MS = 60_000;

export function DevTimeBadge(): JSX.Element | null {
  const state = useQuery<DevScenariosDto, Error>({
    queryKey: DEV_STATE_QUERY_KEY,
    queryFn: fetchDevState,
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  const timeOverride = state.data?.timeOverride ?? null;
  if (!timeOverride) return null;

  return (
    <Tooltip title="Dev-Zeit-Override aktiv — die Server-Zeit ist eingefroren (Admin → Dev / Szenarien → Zurück zu Echtzeit).">
      <Chip
        size="small"
        color="warning"
        icon={<HistoryToggleOffIcon />}
        label={`Server-Zeit eingefroren: ${new Date(timeOverride).toLocaleString('de-DE')}`}
        sx={{ ml: 2, fontWeight: 700 }}
      />
    </Tooltip>
  );
}

export default DevTimeBadge;
