/**
 * Simulation „Neu berechnen" (§E.4 Human-in-the-loop statt Blackbox).
 *
 * Shows the proposed assignment delta and its effect on the eiserne Reserve
 * BEFORE anything goes live. Committing the proposal is a teamlead override and
 * therefore needs a reason and is audited (§8.4).
 */
import { useMemo, useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { isValidReason } from '../../data/audit.js';
import { useCockpitData } from '../../data/store.js';
import { formatMinutes, formatPct } from '../../lib/format.js';
import { MetricCard } from '../../components/MetricCard.js';

export interface SimulationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SimulationPanel({ open, onClose }: SimulationPanelProps): JSX.Element {
  const { simulate, commitSimulation } = useCockpitData();
  const result = useMemo(() => (open ? simulate() : null), [open, simulate]);
  const [reason, setReason] = useState('');

  function handleCommit(): void {
    if (!result || !isValidReason(reason)) return;
    commitSimulation(result, reason.trim());
    setReason('');
    onClose();
  }

  const reserveDrop = result ? result.reserveBeforeMinutes - result.reserveAfterMinutes : 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Neu berechnen – Vorschlag</DialogTitle>
      <DialogContent>
        {result && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <MetricCard label="Neu zugewiesen" value={result.newlyAssigned} tone="positive" />
              <MetricCard
                label="Nicht zuteilbar"
                value={result.unassignedRemaining}
                tone={result.unassignedRemaining > 0 ? 'warning' : 'neutral'}
              />
              <MetricCard
                label="Auslastung"
                value={formatPct(result.utilisationAfterPct)}
                sub={`vorher ${formatPct(result.utilisationBeforePct)}`}
                tone="accent"
              />
              <MetricCard
                label="Reserve nachher"
                value={formatMinutes(result.reserveAfterMinutes)}
                sub={`vorher ${formatMinutes(result.reserveBeforeMinutes)}`}
                tone={result.reserveAfterMinutes <= 0 ? 'danger' : 'neutral'}
              />
            </Stack>

            {reserveDrop > 0 && (
              <Alert severity={result.reserveAfterMinutes <= 0 ? 'error' : 'warning'}>
                Die eiserne Reserve sinkt um {formatMinutes(reserveDrop)}.
                {result.reserveAfterMinutes <= 0 && ' Reserve wäre aufgebraucht!'}
              </Alert>
            )}

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Mitarbeiter</TableCell>
                  <TableCell align="right">Vorher</TableCell>
                  <TableCell align="right">Nachher</TableCell>
                  <TableCell align="right">Delta</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.perEmployee.map((p) => (
                  <TableRow key={p.employeeId}>
                    <TableCell>{p.displayName}</TableCell>
                    <TableCell align="right">{formatMinutes(p.beforeMinutes)}</TableCell>
                    <TableCell align="right">{formatMinutes(p.afterMinutes)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ color: p.deltaMinutes > 0 ? 'success.main' : 'text.secondary' }}
                    >
                      {p.deltaMinutes > 0 ? '+' : ''}
                      {formatMinutes(p.deltaMinutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="body2" color="text.secondary">
              Vorschlag wird erst nach „Live zuweisen" wirksam (Human-in-the-loop).
            </Typography>
            <TextField
              required
              fullWidth
              label="Grund für Neuverteilung (Pflichtfeld)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={reason.length > 0 && !isValidReason(reason)}
              helperText="Wird auditiert (§8.4)."
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Verwerfen</Button>
        <Button
          variant="contained"
          disabled={!result || !isValidReason(reason)}
          onClick={handleCommit}
        >
          Live zuweisen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
