/**
 * Tagescockpit (§10.1 / Anhang E.4) — Automatik-Dispo Steuerzentrale.
 *
 * Model (docs/concept/automatik-dispo-konzept + dispo-flow-rework, redesigned per
 * docs/mockups/tagescockpit): the engine distributes the free pool by itself.
 * The teamlead does NOT click per batch — Automatik (An by default) auto-commits
 * new free work; only exceptions (Probleme, Topf, unvollständige Lieferungen,
 * Überlast, Überbuchung) surface for a human, each as a clickable item, not a
 * passive metric card. „Aus" turns the same engine output into a reviewable
 * Vorschlag. Every number on this page comes from `useCockpitData()` — no new
 * backend fields (see docs/mockups/tagescockpit/README.md §2).
 */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
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
import { ltColors } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import { useEmployeeNames } from '../../data/employeeNames.js';
import { useCaseLabels } from '../../data/caseLabels.js';
import { formatAuditAction } from '../../data/audit.js';
import { SimulationPanel } from '../simulation/SimulationPanel.js';
import { SchnellaktionenListe, useOffeneSchnellaktionen } from './schnellaktionen.js';
import { useAutomatik } from './automatik.js';
import { formatDate, formatDateTime, formatMinutes, formatNumber, formatPct } from '../../lib/format.js';

export function CockpitPage(): JSX.Element {
  const { cockpit, board, lanes, recentOverrides, isLoading, error, refetch, recalculate } =
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

  // --- Distribution health: true partition of today's cases (no invented counts). ---
  const verteilt = Math.max(0, zst.totalCases - pool.openCases);
  const poolRest = pool.openCases;
  const healthTotal = verteilt + poolRest;

  // Schnellaktionen: geteilte Ableitung mit dem Sidebar-Hexagon — schnellaktionen.tsx.
  // Offene (nicht abgehakte) Meldungen — Abhak-Stand geteilt mit dem Flyout.
  const { offen: decisions, abhaken: decisionAbhaken } = useOffeneSchnellaktionen();

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
      {/* Header: title + Automatik toggle + status + actions */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Automatik-Dispo · {formatDate(cockpit.date)}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {isLoading
              ? 'Lädt …'
              : decisions.length === 0
                ? 'Läuft rund'
                : `Läuft — ${decisions.length} ${decisions.length === 1 ? 'Ding braucht' : 'Dinge brauchen'} dich`}
          </Typography>
          <Typography variant="body2" color={planCurrent ? 'success.main' : 'warning.main'} sx={{ fontWeight: 600, mt: 0.5 }}>
            {statusText}
          </Typography>
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
              {recalcResult.assignedCaseCount} zugeteilt · {recalcResult.bundleCount} Bündel ·{' '}
              {recalcResult.unassignedCaseCount} offen
              {recalculate.isPending ? ' · verteilt …' : ''}
            </Typography>
          </Stack>
        </Paper>
      )}

      {/* Distribution health — true partition of today's cases, not a vanity metric. */}
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Verteilungsstatus — {formatNumber(zst.totalCases)} Belege heute
          </Typography>
          <Typography variant="caption" color="text.secondary">
            aktualisiert live
          </Typography>
        </Stack>
        {isLoading ? (
          <Skeleton variant="rounded" height={34} />
        ) : healthTotal === 0 ? (
          <Alert severity="success">Noch keine Belege heute.</Alert>
        ) : (
          <>
            <Stack direction="row" sx={{ height: 34, borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
              {verteilt > 0 && (
                <Box
                  sx={{
                    width: `${(verteilt / healthTotal) * 100}%`,
                    bgcolor: 'success.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {verteilt} verteilt
                </Box>
              )}
              {poolRest > 0 && (
                <Box
                  sx={{
                    width: `${(poolRest / healthTotal) * 100}%`,
                    bgcolor: ltColors.brandLight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {poolRest} im Pool
                </Box>
              )}
            </Stack>
            {pool.openIssues > 0 && (
              <Chip
                size="small"
                color="error"
                variant="outlined"
                label={`${pool.openIssues} davon mit offenem Problem`}
                sx={{ mt: 1 }}
              />
            )}
          </>
        )}
      </Box>

      {/* Schnellaktionen — the only routine human touchpoint, each item clickable. */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>
          Schnellaktionen
        </Typography>
        {isLoading ? (
          <Skeleton variant="rounded" height={64} />
        ) : decisions.length === 0 ? (
          <Alert severity="success">Nichts wartet auf dich — die Automatik hat alles verteilt.</Alert>
        ) : (
          <SchnellaktionenListe decisions={decisions} onAbhaken={decisionAbhaken} />
        )}
      </Box>

      {/* ZST progress — slim line, no longer 5 separate metric cards. */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            ZST-Fortschritt heute
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {zst.completedCases} / {zst.totalCases} Belege · {formatPct(zstPct)}
          </Typography>
        </Stack>
        <LinearProgress variant="determinate" value={zstPct} sx={{ height: 8, borderRadius: 5 }} />
        <Stack direction="row" spacing={3} sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {formatNumber(zst.completedParts)} Teile fertig
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatNumber(zst.partsPerHour)} Teile/h
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatMinutes(capacity.freeCapacityMinutes)} freie Kapazität
          </Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">
          Letzte Eingriffe &amp; Verteilungen (Audit §8.4)
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
