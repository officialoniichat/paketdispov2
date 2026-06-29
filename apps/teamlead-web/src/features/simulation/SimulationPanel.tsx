/**
 * Simulation „Neu berechnen" (§E.4 Human-in-the-loop statt Blackbox).
 *
 * Runs the real assignment engine as a non-committal PREVIEW
 * (`/assignments/preview`, persists nothing): shows the proposed bundle count,
 * assigned/unassigned cases and the per-employee load. Nothing
 * on the board changes until the teamlead presses „Live zuweisen", which calls
 * the real persist (`/assignments/recalculate`) and refetches the cockpit.
 */
import { useEffect, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useCockpitData } from '../../data/store.js';
import { useEmployeeNames } from '../../data/employeeNames.js';
import { formatMinutes, formatPct } from '../../lib/format.js';
import { MetricCard } from '../../components/MetricCard.js';

export interface SimulationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SimulationPanel({ open, onClose }: SimulationPanelProps): JSX.Element {
  const { preview, recalculate } = useCockpitData();
  const employeeName = useEmployeeNames();
  const result = preview.data ?? null;

  const runPreview = preview.mutate;
  const resetPreview = preview.reset;

  // Run a fresh dry-run each time the dialog is opened; clear it when closed.
  useEffect(() => {
    if (open) runPreview();
    else resetPreview();
  }, [open, runPreview, resetPreview]);

  function handleCommit(): void {
    recalculate.mutate(undefined, { onSuccess: () => onClose() });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Verteilungs-Vorschlag</DialogTitle>
      <DialogContent>
        {preview.isPending && (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }} color="text.secondary">
              Engine berechnet den Vorschlag…
            </Typography>
          </Stack>
        )}

        {preview.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {preview.error?.message ?? 'Simulation fehlgeschlagen.'}
          </Alert>
        )}

        {result && !preview.isPending && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <MetricCard label="Bündel" value={result.bundleCount} tone="accent" />
              <MetricCard label="Zugewiesen" value={result.assignedCaseCount} tone="positive" />
              <MetricCard
                label="Nicht zuteilbar"
                value={result.unassignedCaseCount}
                tone={result.unassignedCaseCount > 0 ? 'warning' : 'neutral'}
              />
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Mitarbeiter</TableCell>
                  <TableCell align="right">Bündel</TableCell>
                  <TableCell align="right">Verplant</TableCell>
                  <TableCell align="right">Kapazität</TableCell>
                  <TableCell align="right">Auslastung</TableCell>
                  <TableCell align="right">Punkte</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.loads.map((load) => {
                  const util =
                    load.capacityMinutes === 0
                      ? 0
                      : (load.assignedMinutes / load.capacityMinutes) * 100;
                  return (
                    <TableRow key={load.employeeId}>
                      <TableCell>{employeeName(load.employeeId) ?? load.employeeId}</TableCell>
                      <TableCell align="right">{load.bundleCount}</TableCell>
                      <TableCell align="right">{formatMinutes(load.assignedMinutes)}</TableCell>
                      <TableCell align="right">{formatMinutes(load.capacityMinutes)}</TableCell>
                      <TableCell align="right">{formatPct(util)}</TableCell>
                      <TableCell align="right">{load.assignedPoints}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <Typography variant="body2" color="text.secondary">
              Vorschau – es wird nichts gespeichert. Erst „Übernehmen" schreibt die Verteilung.
            </Typography>

            {recalculate.isError && (
              <Alert severity="error">
                Neuberechnung fehlgeschlagen: {recalculate.error?.message}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={recalculate.isPending}>
          Verwerfen
        </Button>
        <Button
          variant="contained"
          disabled={!result || preview.isPending || recalculate.isPending}
          startIcon={
            recalculate.isPending ? <CircularProgress size={18} color="inherit" /> : undefined
          }
          onClick={handleCommit}
        >
          Übernehmen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
