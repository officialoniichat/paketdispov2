/**
 * Tagescockpit (§10.1 / Anhang E.4 "Operations cockpit statt Liste").
 *
 * Capacity, open prio/CatMan/overdue, reserve, problems and ZST progress at a
 * glance from the LIVE backend, plus „Neu berechnen" which runs the real
 * assignment engine (`/assignments/recalculate`) and a live teamlead override
 * audit trail (§8.4). Loading and error states are first-class.
 */
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalculateIcon from '@mui/icons-material/Calculate';
import DownloadIcon from '@mui/icons-material/Download';
import { useCockpitData } from '../../data/store.js';
import { SimulationPanel } from '../simulation/SimulationPanel.js';
import {
  formatDate,
  formatDateTime,
  formatMinutes,
  formatNumber,
  formatPct,
} from '../../lib/format.js';
import { MetricCard } from '../../components/MetricCard.js';

export function CockpitPage(): JSX.Element {
  const { cockpit, recentOverrides, isLoading, error, refetch, recalculate } = useCockpitData();
  const navigate = useNavigate();
  const [simulationOpen, setSimulationOpen] = useState(false);
  const { capacity, pool, zst } = cockpit;
  const zstPct = zst.totalCases === 0 ? 0 : (zst.completedCases / zst.totalCases) * 100;
  const recalcResult = recalculate.data;

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={refetch}>
            Erneut versuchen
          </Button>
        }
      >
        <AlertTitle>Cockpit konnte nicht geladen werden</AlertTitle>
        {error.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={2}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Heute – Logistik Warenauszeichnung
          </Typography>
          <Typography color="text.secondary">{formatDate(cockpit.date)}</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            variant="contained"
            startIcon={<CalculateIcon />}
            disabled={recalculate.isPending}
            onClick={() => setSimulationOpen(true)}
          >
            Neu berechnen
          </Button>
          <Button variant="outlined" onClick={() => navigate('/board')}>
            Zum Board
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />}>
            Export
          </Button>
        </Stack>
      </Stack>

      <Box>
        <Typography variant="overline" color="text.secondary">
          Kapazität
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {isLoading ? (
            <KpiSkeletons count={5} />
          ) : (
            <>
              <MetricCard label="Geplante MA" value={capacity.plannedEmployees} />
              <MetricCard
                label="Netto-Kapazität"
                value={formatMinutes(capacity.netCapacityMinutes)}
              />
              <MetricCard
                label="Verplant"
                value={formatMinutes(capacity.plannedMinutes)}
                tone="accent"
              />
              <MetricCard
                label="Reserve"
                value={formatMinutes(capacity.reserveMinutes)}
                tone={capacity.reserveMinutes <= 0 ? 'danger' : 'positive'}
              />
              <MetricCard
                label="Auslastung"
                value={formatPct(capacity.utilisationPct)}
                tone="accent"
              />
            </>
          )}
        </Stack>
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary">
          Offener Pool
        </Typography>
        {!isLoading && pool.openCases === 0 ? (
          <Alert severity="success" sx={{ mt: 0.5 }}>
            Kein offener Pool – alle Belege sind verteilt.
          </Alert>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {isLoading ? (
              <KpiSkeletons count={5} />
            ) : (
              <>
                <MetricCard label="Offene Belege" value={pool.openCases} />
                <MetricCard
                  label="Überfällig"
                  value={pool.overdue}
                  tone={pool.overdue > 0 ? 'danger' : 'neutral'}
                />
                <MetricCard
                  label="Prio"
                  value={pool.prio}
                  tone={pool.prio > 0 ? 'danger' : 'neutral'}
                />
                <MetricCard
                  label="CatMan fällig"
                  value={pool.catManDue}
                  tone={pool.catManDue > 0 ? 'warning' : 'neutral'}
                />
                <MetricCard
                  label="Probleme offen"
                  value={pool.openIssues}
                  tone={pool.openIssues > 0 ? 'danger' : 'positive'}
                />
              </>
            )}
          </Stack>
        )}
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">
          ZST-Fortschritt
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
          {isLoading ? (
            <KpiSkeletons count={5} />
          ) : (
            <>
              <MetricCard
                label="Belege fertig"
                value={`${zst.completedCases} / ${zst.totalCases}`}
                tone="positive"
              />
              <MetricCard label="Teile fertig" value={formatNumber(zst.completedParts)} />
              <MetricCard label="Aufwandspunkte" value={formatNumber(zst.effortPoints)} />
              <MetricCard label="Teile/h" value={formatNumber(zst.partsPerHour)} tone="accent" />
              <MetricCard label="Punkte/h" value={zst.effortPointsPerHour} tone="accent" />
            </>
          )}
        </Stack>
        <LinearProgress variant="determinate" value={zstPct} sx={{ height: 10, borderRadius: 5 }} />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">
          Letzte Teamlead-Eingriffe (Audit §8.4)
        </Typography>
        {isLoading ? (
          <Skeleton variant="rounded" height={64} sx={{ mt: 1 }} />
        ) : recentOverrides.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Noch keine manuellen Eingriffe heute.
          </Typography>
        ) : (
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {recentOverrides.slice(0, 8).map((e) => {
              const payload = readAuditPayload(e.payload);
              return (
                <Typography key={e.id} variant="body2">
                  <strong>{formatDateTime(e.timestamp)}</strong> · {payload.action ?? e.eventType} ·{' '}
                  {e.entityId}
                  {payload.reason ? ` – „${payload.reason}"` : ''}
                </Typography>
              );
            })}
          </Stack>
        )}
      </Paper>

      <Snackbar
        open={recalculate.isSuccess && Boolean(recalcResult)}
        autoHideDuration={6000}
        onClose={() => recalculate.reset()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => recalculate.reset()} variant="filled">
          {recalcResult
            ? `Neu berechnet: ${recalcResult.assignedCaseCount} zugewiesen, ` +
              `${recalcResult.unassignedCaseCount} offen, ${recalcResult.bundleCount} Bündel, ` +
              `Reserve ${formatMinutes(recalcResult.reserveMinutes)} (${recalcResult.durationMs} ms).`
            : 'Neu berechnet.'}
        </Alert>
      </Snackbar>

      <Snackbar
        open={recalculate.isError}
        autoHideDuration={8000}
        onClose={() => recalculate.reset()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => recalculate.reset()} variant="filled">
          Neuberechnung fehlgeschlagen: {recalculate.error?.message}
        </Alert>
      </Snackbar>

      <SimulationPanel open={simulationOpen} onClose={() => setSimulationOpen(false)} />
    </Stack>
  );
}

/** Audit payload fields the cockpit renders (§8.4); `WorkflowEvent.payload` is `unknown`. */
interface AuditPayload {
  action?: string;
  reason?: string;
}

/** Safely narrow an `unknown` audit payload to its optional string fields. */
function readAuditPayload(payload: unknown): AuditPayload {
  if (typeof payload !== 'object' || payload === null) return {};
  const action = 'action' in payload ? payload.action : undefined;
  const reason = 'reason' in payload ? payload.reason : undefined;
  return {
    action: typeof action === 'string' ? action : undefined,
    reason: typeof reason === 'string' ? reason : undefined,
  };
}

function KpiSkeletons({ count }: { count: number }): JSX.Element {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="rounded" width={150} height={84} />
      ))}
    </>
  );
}
