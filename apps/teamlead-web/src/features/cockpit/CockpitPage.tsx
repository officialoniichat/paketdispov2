/**
 * Tagescockpit (§10.1 / Anhang E.4) — Automatik-Dispo.
 *
 * Model (docs/concept/automatik-dispo-konzept + dispo-flow-rework): the engine
 * distributes the free pool by itself. The teamlead does NOT click per batch —
 * Automatik (An by default) auto-commits new free work; only exceptions (Probleme,
 * Überlast, Reserve) surface for a human. „Aus" turns the same engine output into a
 * reviewable Vorschlag. One feedback line, no duplicate snackbars, no dead buttons.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { WorkflowEventType } from '@paket/domain-types';
import { useCockpitData } from '../../data/store.js';
import { useEmployeeNames } from '../../data/employeeNames.js';
import { useCaseLabels } from '../../data/caseLabels.js';
import { formatAuditAction } from '../../data/audit.js';
import { SimulationPanel } from '../simulation/SimulationPanel.js';
import { formatDate, formatDateTime, formatMinutes, formatNumber, formatPct } from '../../lib/format.js';
import { MetricCard } from '../../components/MetricCard.js';

/** Auslastungs-Schwelle, ab der ein Kopf als „eng" markiert wird. */
const OVERLOAD_PCT = 90;
const AUTOMATIK_KEY = 'paket.automatik';

function useAutomatik(): readonly [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTOMATIK_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const set = (v: boolean): void => {
    setOn(v);
    try {
      localStorage.setItem(AUTOMATIK_KEY, v ? 'on' : 'off');
    } catch {
      /* ignore storage errors */
    }
  };
  return [on, set] as const;
}

export function CockpitPage(): JSX.Element {
  const { cockpit, board, recentOverrides, isLoading, error, refetch, recalculate } =
    useCockpitData();
  const navigate = useNavigate();
  const [automatik, setAutomatik] = useAutomatik();
  const [simulationOpen, setSimulationOpen] = useState(false);
  const employeeName = useEmployeeNames();
  const caseLabelFromList = useCaseLabels();
  const { capacity, pool, zst } = cockpit;
  const zstPct = zst.totalCases === 0 ? 0 : (zst.completedCases / zst.totalCases) * 100;
  const recalcResult = recalculate.data;

  // --- Automatik: auto-commit new free work (debounced via a "handled" marker) ---
  // freeOpen = ready, unassigned cases the engine MAY distribute. We act only when
  // it GROWS past what we already handled, so stuck/unassignable belege never loop.
  const freeOpen = pool.openCases;
  const handledRef = useRef(0);
  // After every commit, mark the post-commit free count as handled (its leftover is
  // unassignable, so don't re-trigger until a new batch grows the pool again).
  useEffect(() => {
    handledRef.current = freeOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalcResult]);
  useEffect(() => {
    if (!automatik || recalculate.isPending) return;
    if (freeOpen === 0) {
      handledRef.current = 0;
      return;
    }
    if (freeOpen > handledRef.current) {
      handledRef.current = freeOpen;
      recalculate.mutate();
    }
  }, [automatik, freeOpen, recalculate]);

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

  // --- Exceptions: the only things that need a human ---
  const overloaded = board.filter((r) => r.utilisationPct >= OVERLOAD_PCT);
  const problems = pool.openIssues;
  const reserveDanger = capacity.reserveMinutes <= 0;
  const exceptions: string[] = [];
  if (problems > 0) exceptions.push(`${problems} ${problems === 1 ? 'Problem' : 'Probleme'}`);
  if (overloaded.length > 0)
    exceptions.push(`${overloaded.map((r) => r.displayName).join(', ')} ausgelastet ≥ ${OVERLOAD_PCT}%`);
  if (reserveDanger) exceptions.push('Reserve aufgebraucht');

  // --- Plan status / trigger label ---
  const planCurrent = freeOpen === 0;
  const statusText = planCurrent
    ? `● Plan aktuell${recalcResult ? ` · zuletzt verteilt ${recalcResult.assignedCaseCount} Belege` : ''}`
    : `⏳ ${automatik ? 'verteilt …' : 'Vorschlag verfügbar'}: ${freeOpen} ${freeOpen === 1 ? 'freier Beleg' : 'freie Belege'}`;

  // --- Audit: resolve the event's entity id to a human label (Mitarbeitername for
  // employee events, Beleg-Nr otherwise). Both override and case events target a case. ---
  const auditLabel = (eventType: WorkflowEventType, entityId: string): string => {
    if (eventType.startsWith('employee.')) return employeeName(entityId) ?? entityId;
    return caseLabelFromList(entityId) ?? entityId;
  };

  return (
    <Stack spacing={3}>
      {/* Header: title + Automatik toggle + status + actions */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Heute – Logistik Warenauszeichnung
          </Typography>
          <Typography color="text.secondary">{formatDate(cockpit.date)}</Typography>
        </Box>
        <Stack spacing={1} alignItems="flex-end">
          <Tooltip
            arrow
            title={
              automatik
                ? 'Neue Belege werden automatisch nach Schichtplan + Priorität verteilt. Laufende & manuell gesetzte Arbeit bleibt unangetastet.'
                : 'Neue Belege sammeln sich. Du prüfst den Vorschlag und übernimmst selbst.'
            }
          >
            <FormControlLabel
              control={<Switch checked={automatik} onChange={(e) => setAutomatik(e.target.checked)} />}
              label={
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Automatik {automatik ? 'An' : 'Aus'}
                </Typography>
              }
            />
          </Tooltip>
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end">
            {!automatik && (
              <Button
                variant="contained"
                disabled={recalculate.isPending || planCurrent}
                onClick={() => recalculate.mutate()}
              >
                Jetzt verteilen
              </Button>
            )}
            <Button variant="outlined" onClick={() => setSimulationOpen(true)}>
              Vorschlag ansehen
            </Button>
            <Button variant="outlined" onClick={() => navigate('/board')}>
              Zum Board
            </Button>
          </Stack>
        </Stack>
      </Stack>

      {/* Plan-status line — tells the teamlead WHEN the engine matters */}
      <Typography variant="body2" color={planCurrent ? 'success.main' : 'warning.main'} sx={{ fontWeight: 600 }}>
        {statusText}
      </Typography>

      {/* Exception bar — the ONLY routine human touchpoint */}
      {!isLoading && exceptions.length > 0 && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/board')}>
              Ansehen
            </Button>
          }
        >
          <strong>Braucht dich:</strong> {exceptions.join(' · ')}
        </Alert>
      )}

      {/* Auto-distribution feedback — one line, replaces the old duplicate snackbars */}
      {recalculate.isError && (
        <Alert severity="error" onClose={() => recalculate.reset()}>
          Verteilung fehlgeschlagen: {recalculate.error?.message}
        </Alert>
      )}
      {recalcResult && !recalculate.isError && (
        <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'success.light' }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" color="success" label="Verteilt" />
            <Typography variant="body2">
              {recalcResult.assignedCaseCount} zugeteilt · {recalcResult.bundleCount} Pakete ·{' '}
              {recalcResult.unassignedCaseCount} offen · Reserve{' '}
              {formatMinutes(recalcResult.reserveMinutes)}
              {recalculate.isPending ? ' · verteilt …' : ''}
            </Typography>
          </Stack>
        </Paper>
      )}

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
              <MetricCard label="Netto-Kapazität" value={formatMinutes(capacity.netCapacityMinutes)} />
              <MetricCard label="Verplant" value={formatMinutes(capacity.plannedMinutes)} tone="accent" />
              <MetricCard
                label="Reserve"
                value={formatMinutes(capacity.reserveMinutes)}
                tone={capacity.reserveMinutes <= 0 ? 'danger' : 'positive'}
              />
              <MetricCard label="Auslastung" value={formatPct(capacity.utilisationPct)} tone="accent" />
            </>
          )}
        </Stack>
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary">
          Pool
        </Typography>
        {!isLoading && pool.openCases === 0 ? (
          <Alert severity="success" sx={{ mt: 0.5 }}>
            Kein freier Pool – alle verteilbaren Belege sind zugeteilt.
          </Alert>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {isLoading ? (
              <KpiSkeletons count={5} />
            ) : (
              <>
                <MetricCard label="Frei (verteilbar)" value={pool.openCases} />
                <MetricCard label="Überfällig" value={pool.overdue} tone={pool.overdue > 0 ? 'danger' : 'neutral'} />
                <MetricCard label="Prio" value={pool.prio} tone={pool.prio > 0 ? 'danger' : 'neutral'} />
                <MetricCard label="CatMan fällig" value={pool.catManDue} tone={pool.catManDue > 0 ? 'warning' : 'neutral'} />
                <MetricCard label="Probleme offen" value={pool.openIssues} tone={pool.openIssues > 0 ? 'danger' : 'positive'} />
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
              <MetricCard label="Belege fertig" value={`${zst.completedCases} / ${zst.totalCases}`} tone="positive" />
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
          Letzte Eingriffe & Verteilungen (Audit §8.4)
        </Typography>
        {isLoading ? (
          <Skeleton variant="rounded" height={64} sx={{ mt: 1 }} />
        ) : recentOverrides.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Noch keine Eingriffe heute.
          </Typography>
        ) : (
          <Stack spacing={0.75} sx={{ mt: 1 }}>
            {recentOverrides.slice(0, 8).map((e) => {
              const target = auditLabel(e.eventType, e.entityId);
              return (
                <Typography key={e.id} variant="body2">
                  <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
                    {formatDateTime(e.timestamp)}
                  </Box>
                  <strong>{formatAuditAction(e.eventType, e.payload.action)}</strong>
                  {target ? `: ${target}` : ''}
                  {e.payload.reason ? ` — „${e.payload.reason}"` : ''}
                </Typography>
              );
            })}
          </Stack>
        )}
      </Paper>

      <SimulationPanel open={simulationOpen} onClose={() => setSimulationOpen(false)} />
    </Stack>
  );
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
